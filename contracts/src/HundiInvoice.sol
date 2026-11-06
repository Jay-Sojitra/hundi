// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ParticipantRegistry} from "./ParticipantRegistry.sol";

/// @title HundiInvoice
/// @notice Each token id is one invoice. One unit is a claim on one base unit (0.000001) of
///         USDT owed by the importer, so a fully paid invoice redeems 1:1.
contract HundiInvoice is ERC1155, ReentrancyGuard {
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

    uint256 public invoiceCount;
    mapping(uint256 id => Invoice) private _invoices;
    /// @notice Every invoice reference ever registered. Entries are never cleared.
    mapping(bytes32 refHash => bool) public refUsed;

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

    error NotEligible(address account, uint8 role);
    error DuplicateInvoice(bytes32 refHash);
    error InvalidInvoice();
    error InvoiceNotFound(uint256 id);
    error NotDebtor();
    error WrongStatus(Status status);
    error PastDueDate();

    constructor(ParticipantRegistry registry_, IERC20 usdt_) ERC1155("") {
        registry = registry_;
        usdt = usdt_;
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
    // Views and internals
    // ---------------------------------------------------------------------

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return _getInvoice(id);
    }

    function _getInvoice(uint256 id) internal view returns (Invoice storage inv) {
        inv = _invoices[id];
        if (inv.status == Status.None) revert InvoiceNotFound(id);
    }

    function _requireEligible(address account, uint8 role) internal view {
        if (!registry.isEligible(account, role)) revert NotEligible(account, role);
    }
}
