// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HundiBase} from "./HundiBase.t.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";

contract FundingTest is HundiBase {
    uint128 constant UNITS = 4_000e6;
    uint256 constant PRICE = 3_840e6; // 4% below face value

    function _fundAs(address who, uint256 id, uint128 units) internal {
        uint256 price = hundi.quote(id, units);
        usdt.mint(who, price);
        vm.startPrank(who);
        usdt.approve(address(hundi), price);
        hundi.fund(id, units);
        vm.stopPrank();
    }

    function _permitSig(uint256 key, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 typehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, owner, address(hundi), value, usdt.nonces(owner), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(key, digest);
    }

    // R6: delivery versus payment in one transaction
    function test_R6_fundSwapsUnitsAndUsdtAtomically() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        assertEq(usdt.balanceOf(exporter), PRICE);
        assertEq(usdt.balanceOf(investorA), 0);
        assertEq(usdt.balanceOf(address(hundi)), 0);
        assertEq(hundi.balanceOf(investorA, id), UNITS);
        assertEq(hundi.balanceOf(exporter, id), FACE - UNITS);
    }

    function test_R6_noUsdtMeansNoUnitsMove() public {
        uint256 id = _issueAndAcknowledge();
        vm.prank(investorA);
        usdt.approve(address(hundi), PRICE);
        vm.expectRevert();
        vm.prank(investorA);
        hundi.fund(id, UNITS);
        assertEq(hundi.balanceOf(investorA, id), 0);
        assertEq(hundi.balanceOf(exporter, id), FACE);
    }

    function test_partialFillsLeaveTheRestWithTheSeller() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        _fundAs(investorB, id, 1_000e6);
        assertEq(hundi.balanceOf(exporter, id), FACE - UNITS - 1_000e6);
        assertEq(hundi.holdersOf(id).length, 3);
    }

    function test_fullFillRemovesSellerFromHolders() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, FACE);
        address[] memory holders = hundi.holdersOf(id);
        assertEq(holders.length, 1);
        assertEq(holders[0], investorA);
    }

    function test_cannotBuyMoreThanSellerHolds() public {
        uint256 id = _issueAndAcknowledge();
        vm.expectRevert(HundiInvoice.InsufficientUnits.selector);
        vm.prank(investorA);
        hundi.fund(id, FACE + 1);
    }

    function test_priceRoundsUpForTheSeller() public {
        uint256 id = _issueAndAcknowledge();
        assertEq(hundi.quote(id, 1), 1);
    }

    function test_fundWithPermitNeedsNoApproval() public {
        uint256 id = _issueAndAcknowledge();
        usdt.mint(investorA, PRICE);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(investorAKey, investorA, PRICE, deadline);
        vm.prank(investorA);
        hundi.fundWithPermit(id, UNITS, deadline, v, r, s);
        assertEq(hundi.balanceOf(investorA, id), UNITS);
        assertEq(usdt.balanceOf(exporter), PRICE);
    }

    function test_fundWithPermitStillWorksIfPermitWasFrontRun() public {
        uint256 id = _issueAndAcknowledge();
        usdt.mint(investorA, PRICE);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(investorAKey, investorA, PRICE, deadline);
        usdt.permit(investorA, address(hundi), PRICE, deadline, v, r, s);
        vm.prank(investorA);
        hundi.fundWithPermit(id, UNITS, deadline, v, r, s);
        assertEq(hundi.balanceOf(investorA, id), UNITS);
    }

    // R3: nothing can be funded before the debtor confirms it
    function test_R3_cannotFundBeforeAcknowledgement() public {
        uint256 id = _issue(IRN);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotAcknowledged.selector, id));
        vm.prank(investorA);
        hundi.fund(id, UNITS);
    }

    // R4: units can only be held by verified participants
    function test_R4_unverifiedWalletCannotFund() public {
        uint256 id = _issueAndAcknowledge();
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotEligible.selector, outsider, registry.ROLE_INVESTOR()));
        vm.prank(outsider);
        hundi.fund(id, UNITS);
    }

    function test_R4_transferToUnverifiedWalletReverts() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.TransferNotAllowed.selector, id, outsider));
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, outsider, id, 1, "");
    }

    function test_R4_batchTransferCannotBypassTheRules() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        uint256[] memory ids = new uint256[](1);
        uint256[] memory values = new uint256[](1);
        ids[0] = id;
        values[0] = 1;
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.TransferNotAllowed.selector, id, outsider));
        vm.prank(investorA);
        hundi.safeBatchTransferFrom(investorA, outsider, ids, values, "");
    }

    function test_R4_transferBetweenVerifiedInvestorsWorks() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, investorB, id, UNITS, "");
        assertEq(hundi.balanceOf(investorB, id), UNITS);
        assertEq(hundi.holdersOf(id).length, 2); // exporter and investorB
    }

    function test_R4_frozenInvestorCannotSend() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        vm.prank(verifier);
        registry.setFrozen(investorA, true);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.TransferNotAllowed.selector, id, investorA));
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, investorB, id, 1, "");
    }

    function test_R4_expiredInvestorCannotReceive() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        uint8 role = registry.ROLE_INVESTOR();
        vm.prank(verifier);
        registry.setParticipant(investorB, role, uint64(block.timestamp + 1), "SG");
        vm.warp(block.timestamp + 2);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.TransferNotAllowed.selector, id, investorB));
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, investorB, id, 1, "");
    }

    // R5: the due date fixes who gets paid
    function test_R5_cannotFundAtOrAfterDueDate() public {
        uint256 id = _issueAndAcknowledge();
        vm.warp(hundi.getInvoice(id).dueDate);
        vm.expectRevert(HundiInvoice.PastDueDate.selector);
        vm.prank(investorA);
        hundi.fund(id, UNITS);
    }

    function test_R5_cannotTransferAtOrAfterDueDate() public {
        uint256 id = _issueAndAcknowledge();
        _fundAs(investorA, id, UNITS);
        vm.warp(hundi.getInvoice(id).dueDate);
        vm.expectRevert(HundiInvoice.PastDueDate.selector);
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, investorB, id, 1, "");
    }
}
