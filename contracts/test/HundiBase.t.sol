// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

abstract contract HundiBase is Test {
    ParticipantRegistry registry;
    HundiInvoice hundi;
    MockUSDT usdt;

    address verifier = makeAddr("verifier");
    address exporter = makeAddr("exporter");
    address importer = makeAddr("importer");
    address investorA;
    uint256 investorAKey;
    address investorB = makeAddr("investorB");
    address outsider = makeAddr("outsider");

    uint128 constant FACE = 10_000e6;
    uint16 constant DISCOUNT = 400; // 4%
    uint64 constant TENOR = 60 days;
    uint256 constant GRACE = 3 days;
    bytes32 constant IRN = keccak256("IRN-0001");
    bytes32 constant DOC = keccak256("invoice.pdf");

    function setUp() public virtual {
        (investorA, investorAKey) = makeAddrAndKey("investorA");
        usdt = new MockUSDT();
        registry = new ParticipantRegistry(verifier);
        hundi = _deployHundi();

        uint64 expiry = uint64(block.timestamp + 365 days);
        vm.startPrank(verifier);
        registry.setParticipant(exporter, registry.ROLE_EXPORTER(), expiry, "IN");
        registry.setParticipant(importer, registry.ROLE_IMPORTER(), expiry, "AE");
        registry.setParticipant(investorA, registry.ROLE_INVESTOR(), expiry, "IN");
        registry.setParticipant(investorB, registry.ROLE_INVESTOR(), expiry, "SG");
        vm.stopPrank();
    }

    function _deployHundi() internal virtual returns (HundiInvoice) {
        return new HundiInvoice(registry, usdt);
    }

    function _issue(bytes32 ref) internal returns (uint256) {
        vm.prank(exporter);
        return hundi.issue(importer, FACE, uint64(block.timestamp) + TENOR, DISCOUNT, ref, DOC);
    }

    function _issueAndAcknowledge() internal returns (uint256 id) {
        id = _issue(IRN);
        vm.prank(importer);
        hundi.acknowledge(id);
    }
}
