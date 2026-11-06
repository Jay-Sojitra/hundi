// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HundiBase} from "./HundiBase.t.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";

contract SettlementTest is HundiBase {
    uint128 constant A_UNITS = 6_000e6;
    uint128 constant B_UNITS = 3_000e6;
    uint128 constant SELLER_UNITS = FACE - A_UNITS - B_UNITS;
    address keeper = makeAddr("keeper");
    uint256 id;

    function setUp() public override {
        super.setUp();
        id = _issueAndAcknowledge();
        _fundAs(investorA, id, A_UNITS);
        _fundAs(investorB, id, B_UNITS);
    }

    function _debtorAllows(uint256 balance) internal {
        usdt.mint(importer, balance);
        vm.prank(importer);
        usdt.approve(address(hundi), type(uint256).max);
    }

    function _toDueDate() internal {
        vm.warp(hundi.getInvoice(id).dueDate);
    }

    function _toEndOfGrace() internal {
        vm.warp(uint256(hundi.getInvoice(id).dueDate) + GRACE);
    }

    function _status() internal view returns (HundiInvoice.Status) {
        return hundi.getInvoice(id).status;
    }

    function test_cannotSettleBeforeDueDate() public {
        _debtorAllows(FACE);
        vm.warp(hundi.getInvoice(id).dueDate - 1);
        vm.expectRevert(HundiInvoice.NotDue.selector);
        hundi.settle(id);
    }

    // Automatic settlement: a third party triggers it and investors do nothing.
    function test_keeperSettlesAndDistributesWithoutInvestorAction() public {
        _debtorAllows(FACE);
        _toDueDate();
        uint256 exporterBefore = usdt.balanceOf(exporter);

        vm.startPrank(keeper);
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        vm.stopPrank();

        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Settled));
        assertEq(usdt.balanceOf(investorA), A_UNITS);
        assertEq(usdt.balanceOf(investorB), B_UNITS);
        assertEq(usdt.balanceOf(exporter), exporterBefore + SELLER_UNITS);
        assertEq(usdt.balanceOf(address(hundi)), 0);
        assertEq(usdt.balanceOf(importer), 0);
    }

    function test_investorEarnsTheDiscount() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorA), A_UNITS);
        assertGt(A_UNITS, hundi.quote(id, A_UNITS));
    }

    function test_settledUnitsAreBurnedAndHoldersCleared() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        assertEq(hundi.balanceOf(investorA, id), 0);
        assertEq(hundi.holdersOf(id).length, 0);
    }

    function test_distributeCanRunInPages() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        hundi.distribute(id, 2, 1);
        assertEq(hundi.holdersOf(id).length, 2);
        hundi.distribute(id, 0, 2);
        assertEq(hundi.holdersOf(id).length, 0);
        assertEq(usdt.balanceOf(address(hundi)), 0);
    }

    // R7: repayment always goes to the contract, never the seller
    function test_R7_repaymentIsHeldByTheContract() public {
        _debtorAllows(FACE);
        _toDueDate();
        uint256 exporterBefore = usdt.balanceOf(exporter);
        hundi.settle(id);
        assertEq(usdt.balanceOf(address(hundi)), FACE);
        assertEq(usdt.balanceOf(exporter), exporterBefore);
    }

    // R8: nothing can be redeemed before settlement
    function test_R8_cannotRedeemBeforeSettlement() public {
        vm.expectRevert(HundiInvoice.NotSettled.selector);
        vm.prank(investorA);
        hundi.redeem(id);
        assertEq(hundi.claimable(id, investorA), 0);
    }

    function test_R8_cannotDistributeBeforeSettlement() public {
        vm.expectRevert(HundiInvoice.NotSettled.selector);
        hundi.distribute(id, 0, 10);
    }

    function test_R8_earlyPartialRepaymentIsNotRedeemable() public {
        usdt.mint(importer, 1_000e6);
        vm.startPrank(importer);
        usdt.approve(address(hundi), 1_000e6);
        hundi.repay(id, 1_000e6);
        vm.stopPrank();
        vm.expectRevert(HundiInvoice.NotSettled.selector);
        vm.prank(investorA);
        hundi.redeem(id);
    }

    function test_holderCanRedeemThemselves() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        vm.prank(investorA);
        hundi.redeem(id);
        assertEq(usdt.balanceOf(investorA), A_UNITS);
        vm.expectRevert(HundiInvoice.NothingToClaim.selector);
        vm.prank(investorA);
        hundi.redeem(id);
    }

    function test_shortPaymentStaysOpenDuringGrace() public {
        _debtorAllows(FACE / 2);
        _toDueDate();
        hundi.settle(id);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Acknowledged));
        assertEq(hundi.collected(id), FACE / 2);
    }

    function test_debtorCanCompletePaymentDuringGrace() public {
        _debtorAllows(FACE / 2);
        _toDueDate();
        hundi.settle(id);
        usdt.mint(importer, FACE / 2);
        hundi.settle(id);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Settled));
    }

    function test_R8_shortPaymentDefaultsAfterGraceAndPaysProRata() public {
        _debtorAllows(FACE / 2);
        _toEndOfGrace();
        hundi.settle(id);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Defaulted));
        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorA), A_UNITS / 2);
        assertEq(usdt.balanceOf(investorB), B_UNITS / 2);
    }

    function test_noPaymentAtAllStillDefaults() public {
        _toEndOfGrace();
        hundi.settle(id);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Defaulted));
        assertEq(hundi.claimable(id, investorA), 0);
    }

    function test_R8_laterRecoveryIsSharedFairly() public {
        _debtorAllows(FACE / 2);
        _toEndOfGrace();
        hundi.settle(id);
        // A collects its share of the first payment. B has not collected anything yet.
        vm.prank(investorA);
        hundi.redeem(id);

        usdt.mint(importer, FACE / 2);
        vm.prank(importer);
        hundi.repay(id, FACE / 2);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Settled));

        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorA), A_UNITS);
        assertEq(usdt.balanceOf(investorB), B_UNITS);
        assertEq(usdt.balanceOf(address(hundi)), 0);
    }

    function test_earlyFullRepaymentSettlesAndLocksTransfers() public {
        usdt.mint(importer, FACE);
        vm.startPrank(importer);
        usdt.approve(address(hundi), FACE);
        hundi.repay(id, FACE);
        vm.stopPrank();
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Settled));
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotAcknowledged.selector, id));
        vm.prank(investorA);
        hundi.safeTransferFrom(investorA, investorB, id, 1, "");
    }

    function test_repayCannotOverpay() public {
        usdt.mint(importer, FACE + 1);
        vm.startPrank(importer);
        usdt.approve(address(hundi), FACE + 1);
        hundi.repay(id, FACE + 1);
        vm.stopPrank();
        assertEq(hundi.collected(id), FACE);
        assertEq(usdt.balanceOf(importer), 1);
    }

    function test_blockedHolderDoesNotStopOthers() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        usdt.setBlocked(investorA, true);
        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorB), B_UNITS);
        assertEq(hundi.balanceOf(investorA, id), A_UNITS);

        usdt.setBlocked(investorA, false);
        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorA), A_UNITS);
    }

    function test_frozenHolderIsSkippedAndCannotRedeem() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        vm.prank(verifier);
        registry.setFrozen(investorA, true);
        hundi.distribute(id, 0, 10);
        assertEq(usdt.balanceOf(investorA), 0);
        assertEq(usdt.balanceOf(investorB), B_UNITS);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.TransferNotAllowed.selector, id, investorA));
        vm.prank(investorA);
        hundi.redeem(id);
    }

    function test_blockedDebtorStillReachesDefault() public {
        _debtorAllows(FACE);
        usdt.setBlocked(importer, true);
        _toEndOfGrace();
        hundi.settle(id);
        assertEq(uint8(_status()), uint8(HundiInvoice.Status.Defaulted));
    }

    function test_cannotSettleTwice() public {
        _debtorAllows(FACE);
        _toDueDate();
        hundi.settle(id);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.WrongStatus.selector, HundiInvoice.Status.Settled));
        hundi.settle(id);
    }

    function testFuzz_paidOutNeverExceedsCollected(uint128 collectedAmount) public {
        collectedAmount = uint128(bound(collectedAmount, 1, FACE));
        _debtorAllows(collectedAmount);
        _toEndOfGrace();
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        uint256 paid = usdt.balanceOf(investorA) + usdt.balanceOf(investorB);
        assertLe(paid, collectedAmount);
    }
}
