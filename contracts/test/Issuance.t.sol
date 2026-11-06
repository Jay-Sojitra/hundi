// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HundiBase} from "./HundiBase.t.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";

contract IssuanceTest is HundiBase {
    function test_issueRecordsInvoiceWithoutMinting() public {
        uint256 id = _issue(IRN);
        HundiInvoice.Invoice memory inv = hundi.getInvoice(id);
        assertEq(inv.seller, exporter);
        assertEq(inv.debtor, importer);
        assertEq(inv.face, FACE);
        assertEq(uint8(inv.status), uint8(HundiInvoice.Status.Issued));
        assertEq(hundi.balanceOf(exporter, id), 0);
    }

    // R1: only verified exporters can issue
    function test_R1_unverifiedExporterCannotIssue() public {
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotEligible.selector, outsider, registry.ROLE_EXPORTER()));
        vm.prank(outsider);
        hundi.issue(importer, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, IRN, DOC);
    }

    // R1: the debtor must be a verified importer
    function test_R1_debtorMustBeVerifiedImporter() public {
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotEligible.selector, outsider, registry.ROLE_IMPORTER()));
        vm.prank(exporter);
        hundi.issue(outsider, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, IRN, DOC);
    }

    function test_R1_expiredExporterCannotIssue() public {
        vm.warp(block.timestamp + 366 days);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.NotEligible.selector, exporter, registry.ROLE_EXPORTER()));
        vm.prank(exporter);
        hundi.issue(importer, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, IRN, DOC);
    }

    // R2: double financing is impossible
    function test_R2_sameReferenceCannotBeIssuedTwice() public {
        _issue(IRN);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.DuplicateInvoice.selector, IRN));
        vm.prank(exporter);
        hundi.issue(importer, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, IRN, DOC);
    }

    function test_R2_anotherExporterCannotReuseReference() public {
        address other = makeAddr("otherExporter");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint8 role = registry.ROLE_EXPORTER();
        vm.prank(verifier);
        registry.setParticipant(other, role, expiry, "IN");
        _issue(IRN);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.DuplicateInvoice.selector, IRN));
        vm.prank(other);
        hundi.issue(importer, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, IRN, DOC);
    }

    function test_R2_rejectedInvoiceReferenceStaysUsed() public {
        uint256 id = _issue(IRN);
        vm.prank(importer);
        hundi.reject(id);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.DuplicateInvoice.selector, IRN));
        _issue(IRN);
    }

    function test_issueRejectsBadParameters() public {
        vm.startPrank(exporter);
        uint64 due = uint64(block.timestamp) + TENOR;
        vm.expectRevert(HundiInvoice.InvalidInvoice.selector);
        hundi.issue(importer, 0, due, DISCOUNT, IRN, DOC);
        vm.expectRevert(HundiInvoice.InvalidInvoice.selector);
        hundi.issue(importer, FACE, uint64(block.timestamp), DISCOUNT, IRN, DOC);
        vm.expectRevert(HundiInvoice.InvalidInvoice.selector);
        hundi.issue(importer, FACE, due, 5_001, IRN, DOC);
        vm.expectRevert(HundiInvoice.InvalidInvoice.selector);
        hundi.issue(importer, FACE, due, DISCOUNT, bytes32(0), DOC);
        vm.stopPrank();
    }

    // R3: units only exist once the debtor confirms the invoice
    function test_R3_acknowledgeMintsFaceToSeller() public {
        uint256 id = _issueAndAcknowledge();
        assertEq(hundi.balanceOf(exporter, id), FACE);
        assertEq(uint8(hundi.getInvoice(id).status), uint8(HundiInvoice.Status.Acknowledged));
    }

    function test_R3_onlyDebtorCanAcknowledge() public {
        uint256 id = _issue(IRN);
        vm.expectRevert(HundiInvoice.NotDebtor.selector);
        vm.prank(exporter);
        hundi.acknowledge(id);
    }

    function test_cannotAcknowledgeTwiceOrAfterReject() public {
        uint256 id = _issueAndAcknowledge();
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.WrongStatus.selector, HundiInvoice.Status.Acknowledged));
        vm.prank(importer);
        hundi.acknowledge(id);

        uint256 id2 = _issue(keccak256("IRN-0002"));
        vm.startPrank(importer);
        hundi.reject(id2);
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.WrongStatus.selector, HundiInvoice.Status.Rejected));
        hundi.acknowledge(id2);
        vm.stopPrank();
    }

    function test_cannotAcknowledgeAfterDueDate() public {
        uint256 id = _issue(IRN);
        vm.warp(block.timestamp + TENOR);
        vm.expectRevert(HundiInvoice.PastDueDate.selector);
        vm.prank(importer);
        hundi.acknowledge(id);
    }

    function test_unknownInvoiceReverts() public {
        vm.expectRevert(abi.encodeWithSelector(HundiInvoice.InvoiceNotFound.selector, 99));
        hundi.getInvoice(99);
    }
}
