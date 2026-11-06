// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ParticipantRegistry} from "./ParticipantRegistry.sol";

/// @title HundiInvoice
/// @notice Each token id is one invoice. One unit is a claim on one base unit (0.000001) of
///         USDT owed by the importer, so a fully paid invoice redeems 1:1.
contract HundiInvoice is ERC1155, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    enum Status {
        None,
        Issued,
        Acknowledged,
        Rejected,
        Settled,
        Defaulted
    }

    struct Invoice {
        address seller;
        address debtor;
        uint128 face;
        uint64 dueDate;
        uint16 discountBps;
        Status status;
        bytes32 refHash;
        bytes32 docHash;
    }

    uint16 public constant MAX_DISCOUNT_BPS = 5_000;

    ParticipantRegistry public immutable registry;
    IERC20 public immutable usdt;
    /// @notice Time after the due date before a short-paid invoice is marked as defaulted.
    uint64 public immutable gracePeriod;

    uint256 public invoiceCount;
    mapping(uint256 id => Invoice) private _invoices;
    /// @notice Every invoice reference ever registered. Entries are never cleared.
    mapping(bytes32 refHash => bool) public refUsed;
    mapping(uint256 id => EnumerableSet.AddressSet) private _holders;
    /// @notice USDT received for each invoice. Only this contract ever receives repayment.
    mapping(uint256 id => uint256) public collected;
    /// @notice USDT already paid to each holder of each invoice.
    mapping(uint256 id => mapping(address holder => uint256)) public claimed;

    event InvoiceIssued(
        uint256 indexed id,
        address indexed seller,
        address indexed debtor,
        uint256 face,
        uint64 dueDate,
        uint16 discountBps,
        bytes32 refHash,
        bytes32 docHash
    );
    event InvoiceAcknowledged(uint256 indexed id, address indexed debtor);
    event InvoiceRejected(uint256 indexed id, address indexed debtor);
    event InvoiceFunded(uint256 indexed id, address indexed investor, uint256 units, uint256 price);
    event InvoiceRepaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 totalCollected);
    event InvoiceSettled(uint256 indexed id);
    event InvoiceDefaulted(uint256 indexed id, uint256 totalCollected);
    event HolderPaid(uint256 indexed id, address indexed holder, uint256 amount);

    error NotEligible(address account, uint8 role);
    error DuplicateInvoice(bytes32 refHash);
    error InvalidInvoice();
    error InvoiceNotFound(uint256 id);
    error NotDebtor();
    error WrongStatus(Status status);
    error PastDueDate();
    error NotAcknowledged(uint256 id);
    error TransferNotAllowed(uint256 id, address account);
    error InsufficientUnits();
    error NotDue();
    error NotSettled();
    error NothingToClaim();

    constructor(ParticipantRegistry registry_, IERC20 usdt_, uint64 gracePeriod_) ERC1155("") {
        registry = registry_;
        usdt = usdt_;
        gracePeriod = gracePeriod_;
    }

    // ---------------------------------------------------------------------
    // Issuance
    // ---------------------------------------------------------------------

    /// @notice Registers an invoice. No units exist until the debtor acknowledges it.
    /// @param refHash Hash of the invoice reference (the GST e-invoice IRN). Usable once, ever.
    /// @param docHash Hash of the invoice document, kept off chain.
    function issue(address debtor, uint128 face, uint64 dueDate, uint16 discountBps, bytes32 refHash, bytes32 docHash)
        external
        returns (uint256 id)
    {
        _requireEligible(msg.sender, registry.ROLE_EXPORTER());
        _requireEligible(debtor, registry.ROLE_IMPORTER());
        if (
            face == 0 || dueDate <= block.timestamp || discountBps > MAX_DISCOUNT_BPS || refHash == bytes32(0)
                || debtor == msg.sender
        ) revert InvalidInvoice();
        if (refUsed[refHash]) revert DuplicateInvoice(refHash);

        refUsed[refHash] = true;
        id = ++invoiceCount;
        _invoices[id] = Invoice({
            seller: msg.sender,
            debtor: debtor,
            face: face,
            dueDate: dueDate,
            discountBps: discountBps,
            status: Status.Issued,
            refHash: refHash,
            docHash: docHash
        });
        emit InvoiceIssued(id, msg.sender, debtor, face, dueDate, discountBps, refHash, docHash);
    }

    /// @notice The debtor confirms the invoice is genuine, which mints the units to the seller.
    function acknowledge(uint256 id) external {
        Invoice storage inv = _getInvoice(id);
        if (msg.sender != inv.debtor) revert NotDebtor();
        if (inv.status != Status.Issued) revert WrongStatus(inv.status);
        if (block.timestamp >= inv.dueDate) revert PastDueDate();
        _requireEligible(msg.sender, registry.ROLE_IMPORTER());

        inv.status = Status.Acknowledged;
        emit InvoiceAcknowledged(id, msg.sender);
        _mint(inv.seller, id, inv.face, "");
    }

    /// @notice The debtor disputes the invoice. It can never be financed.
    function reject(uint256 id) external {
        Invoice storage inv = _getInvoice(id);
        if (msg.sender != inv.debtor) revert NotDebtor();
        if (inv.status != Status.Issued) revert WrongStatus(inv.status);

        inv.status = Status.Rejected;
        emit InvoiceRejected(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice Buys units from the seller at the discount. USDT and units move in one
    ///         transaction, so neither side can be left without the other.
    function fund(uint256 id, uint128 units) external nonReentrant {
        _fund(id, units);
    }

    /// @notice Same as `fund`, using a USDT permit signature instead of a prior approval.
    function fundWithPermit(uint256 id, uint128 units, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        // A front-run permit should not block funding: the allowance check in `_fund` decides.
        try IERC20Permit(address(usdt)).permit(msg.sender, address(this), quote(id, units), deadline, v, r, s) {}
            catch {}
        _fund(id, units);
    }

    /// @notice USDT price of `units` of an invoice, rounded up in the seller's favour.
    function quote(uint256 id, uint128 units) public view returns (uint256) {
        return Math.mulDiv(units, 10_000 - _getInvoice(id).discountBps, 10_000, Math.Rounding.Ceil);
    }

    function _fund(uint256 id, uint128 units) internal {
        Invoice storage inv = _getInvoice(id);
        if (inv.status != Status.Acknowledged) revert NotAcknowledged(id);
        if (block.timestamp >= inv.dueDate) revert PastDueDate();
        if (units == 0 || units > balanceOf(inv.seller, id)) revert InsufficientUnits();
        _requireEligible(msg.sender, registry.ROLE_INVESTOR());

        uint256 price = quote(id, units);
        emit InvoiceFunded(id, msg.sender, units, price);
        usdt.safeTransferFrom(msg.sender, inv.seller, price);
        _safeTransferFrom(inv.seller, msg.sender, id, units, "");
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Collects what the debtor owes, once the due date has passed. Anyone can call this.
    ///         A short payment stays open during the grace period, then the invoice defaults.
    function settle(uint256 id) external nonReentrant {
        Invoice storage inv = _getInvoice(id);
        if (inv.status != Status.Acknowledged) revert WrongStatus(inv.status);
        if (block.timestamp < inv.dueDate) revert NotDue();

        uint256 amount = Math.min(
            inv.face - collected[id], Math.min(usdt.allowance(inv.debtor, address(this)), usdt.balanceOf(inv.debtor))
        );
        // A failed pull must still let the invoice reach Defaulted, so this does not revert.
        if (amount != 0 && usdt.trySafeTransferFrom(inv.debtor, address(this), amount)) {
            _recordRepayment(id, inv, inv.debtor, amount);
        }
        if (inv.status == Status.Acknowledged && block.timestamp >= uint256(inv.dueDate) + gracePeriod) {
            inv.status = Status.Defaulted;
            emit InvoiceDefaulted(id, collected[id]);
        }
    }

    /// @notice Pays towards an invoice directly: early repayment, or recovery after a default.
    function repay(uint256 id, uint256 amount) external nonReentrant {
        Invoice storage inv = _getInvoice(id);
        if (inv.status != Status.Acknowledged && inv.status != Status.Defaulted) revert WrongStatus(inv.status);

        amount = Math.min(amount, inv.face - collected[id]);
        if (amount == 0) revert NothingToClaim();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        _recordRepayment(id, inv, msg.sender, amount);
    }

    /// @notice Pays out holders in the range [start, start + count). Anyone can call this, so
    ///         investors are paid without acting. A holder who can't be paid is skipped and
    ///         keeps their claim, so one blocked or frozen wallet can't stop the others.
    function distribute(uint256 id, uint256 start, uint256 count) external nonReentrant {
        Status status = _getInvoice(id).status;
        if (status != Status.Settled && status != Status.Defaulted) revert NotSettled();

        EnumerableSet.AddressSet storage holders = _holders[id];
        uint256 end = Math.min(start + count, holders.length());
        // Descending, because paying a holder in full removes them by swapping in the last entry.
        for (uint256 i = end; i > start; --i) {
            address holder = holders.at(i - 1);
            if (!registry.isFrozen(holder)) _pay(id, holder);
        }
    }

    /// @notice Lets a holder collect their own share at any time after settlement or default.
    function redeem(uint256 id) external nonReentrant {
        Status status = _getInvoice(id).status;
        if (status != Status.Settled && status != Status.Defaulted) revert NotSettled();
        if (registry.isFrozen(msg.sender)) revert TransferNotAllowed(id, msg.sender);
        if (!_pay(id, msg.sender)) revert NothingToClaim();
    }

    /// @notice USDT a holder can collect now: their share of everything collected, less what
    ///         they already received. Balances cannot change once an invoice leaves Acknowledged.
    function claimable(uint256 id, address holder) public view returns (uint256) {
        Invoice storage inv = _getInvoice(id);
        if (inv.status != Status.Settled && inv.status != Status.Defaulted) return 0;
        uint256 entitled = Math.mulDiv(balanceOf(holder, id), collected[id], inv.face);
        return entitled > claimed[id][holder] ? entitled - claimed[id][holder] : 0;
    }

    function _recordRepayment(uint256 id, Invoice storage inv, address payer, uint256 amount) internal {
        uint256 total = collected[id] + amount;
        collected[id] = total;
        emit InvoiceRepaid(id, payer, amount, total);
        if (total == inv.face) {
            inv.status = Status.Settled;
            emit InvoiceSettled(id);
        }
    }

    function _pay(uint256 id, address holder) internal returns (bool) {
        uint256 amount = claimable(id, holder);
        if (amount == 0) return false;

        uint256 alreadyClaimed = claimed[id][holder];
        claimed[id][holder] = alreadyClaimed + amount;
        if (!usdt.trySafeTransfer(holder, amount)) {
            claimed[id][holder] = alreadyClaimed;
            return false;
        }
        emit HolderPaid(id, holder, amount);
        // Units are spent once fully paid. After a default they stay, to claim later recoveries.
        if (_invoices[id].status == Status.Settled) _burn(holder, id, balanceOf(holder, id));
        return true;
    }

    // ---------------------------------------------------------------------
    // Transfer rules
    // ---------------------------------------------------------------------

    /// @dev Every mint, transfer and burn passes through here, so the rules cannot be bypassed
    ///      by calling `safeTransferFrom` or `safeBatchTransferFrom` directly.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) {
            for (uint256 i; i < ids.length; ++i) {
                Invoice storage inv = _getInvoice(ids[i]);
                if (block.timestamp >= inv.dueDate) revert PastDueDate();
                if (inv.status != Status.Acknowledged) revert NotAcknowledged(ids[i]);
                _requireCanHold(inv, ids[i], from);
                _requireCanHold(inv, ids[i], to);
            }
        }

        super._update(from, to, ids, values);

        for (uint256 i; i < ids.length; ++i) {
            if (from != address(0) && balanceOf(from, ids[i]) == 0) _holders[ids[i]].remove(from);
            if (to != address(0) && values[i] != 0) _holders[ids[i]].add(to);
        }
    }

    function _requireCanHold(Invoice storage inv, uint256 id, address account) internal view {
        uint8 role = account == inv.seller ? registry.ROLE_EXPORTER() : registry.ROLE_INVESTOR();
        if (!registry.isEligible(account, role)) revert TransferNotAllowed(id, account);
    }

    // ---------------------------------------------------------------------
    // Views and internals
    // ---------------------------------------------------------------------

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return _getInvoice(id);
    }

    function holdersOf(uint256 id) external view returns (address[] memory) {
        return _holders[id].values();
    }

    function _getInvoice(uint256 id) internal view returns (Invoice storage inv) {
        inv = _invoices[id];
        if (inv.status == Status.None) revert InvoiceNotFound(id);
    }

    function _requireEligible(address account, uint8 role) internal view {
        if (!registry.isEligible(account, role)) revert NotEligible(account, role);
    }
}
