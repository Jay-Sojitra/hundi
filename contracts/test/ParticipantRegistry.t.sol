// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";

contract ParticipantRegistryTest is Test {
    ParticipantRegistry registry;
    address verifier = makeAddr("verifier");
    address alice = makeAddr("alice");
    uint8 constant INVESTOR = 4;
    uint8 constant EXPORTER = 1;

    function setUp() public {
        registry = new ParticipantRegistry(verifier);
    }

    function _approve(address who, uint8 roles) internal {
        vm.prank(verifier);
        registry.setParticipant(who, roles, uint64(block.timestamp + 30 days), "IN");
    }

    function test_approvedAccountIsEligibleForItsRoleOnly() public {
        _approve(alice, INVESTOR);
        assertTrue(registry.isEligible(alice, INVESTOR));
        assertFalse(registry.isEligible(alice, EXPORTER));
    }

    function test_unknownAccountIsNotEligible() public view {
        assertFalse(registry.isEligible(alice, INVESTOR));
    }

    function test_approvalExpires() public {
        _approve(alice, INVESTOR);
        vm.warp(block.timestamp + 30 days);
        assertFalse(registry.isEligible(alice, INVESTOR));
    }

    function test_freezeRevokesEligibility() public {
        _approve(alice, INVESTOR);
        vm.prank(verifier);
        registry.setFrozen(alice, true);
        assertFalse(registry.isEligible(alice, INVESTOR));
        assertTrue(registry.isFrozen(alice));
    }

    function test_reapprovalDoesNotClearFreeze() public {
        _approve(alice, INVESTOR);
        vm.prank(verifier);
        registry.setFrozen(alice, true);
        _approve(alice, INVESTOR);
        assertFalse(registry.isEligible(alice, INVESTOR));
    }

    function test_onlyVerifierCanApprove() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, registry.VERIFIER_ROLE()
            )
        );
        vm.prank(alice);
        registry.setParticipant(alice, INVESTOR, uint64(block.timestamp + 1 days), "IN");
    }

    function test_rejectsExpiredOrEmptyApproval() public {
        vm.startPrank(verifier);
        vm.expectRevert(ParticipantRegistry.InvalidParticipant.selector);
        registry.setParticipant(alice, INVESTOR, uint64(block.timestamp), "IN");
        vm.expectRevert(ParticipantRegistry.InvalidParticipant.selector);
        registry.setParticipant(alice, 0, uint64(block.timestamp + 1 days), "IN");
        vm.stopPrank();
    }
}
