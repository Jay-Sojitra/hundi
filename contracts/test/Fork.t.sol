// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";

/// @notice Runs the lifecycle against the real USDT on a fork of Whitechain Sepolia, to prove the
///         contracts work with TetherTokenV2 and not only the mock. Run with:
///         FORK_TEST=true forge test --match-contract ForkTest -vv
contract ForkTest is Test {
    IERC20 constant USDT = IERC20(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    address constant USDT_HOLDER = 0xA1616Fe9624B64eF2Dddc8ccAc735bAA234CEbF7;
    uint128 constant FACE = 5e6;

    ParticipantRegistry registry;
    HundiInvoice hundi;
    address verifier = makeAddr("verifier");
    address exporter = makeAddr("exporter");
    address importer = makeAddr("importer");
    address investor;
    uint256 investorKey;

    function setUp() public {
        if (!vm.envOr("FORK_TEST", false)) vm.skip(true);
        vm.createSelectFork("whitechain");
        (investor, investorKey) = makeAddrAndKey("investor");
        registry = new ParticipantRegistry(verifier);
        hundi = new HundiInvoice(registry, USDT, 60);

        uint64 expiry = uint64(block.timestamp + 30 days);
        vm.startPrank(verifier);
        registry.setParticipant(exporter, 1, expiry, "IN");
        registry.setParticipant(importer, 2, expiry, "AE");
        registry.setParticipant(investor, 4, expiry, "IN");
        vm.stopPrank();

        vm.startPrank(USDT_HOLDER);
        USDT.transfer(importer, FACE);
        USDT.transfer(investor, FACE);
        vm.stopPrank();
    }

    function test_fullLifecycleOnRealUsdt() public {
        vm.prank(exporter);
        uint256 id =
            hundi.issue(importer, FACE, uint64(block.timestamp + 1 hours), 400, keccak256("IRN-FORK"), bytes32(0));
        vm.startPrank(importer);
        hundi.acknowledge(id);
        USDT.approve(address(hundi), FACE);
        vm.stopPrank();

        uint256 price = hundi.quote(id, FACE);
        vm.startPrank(investor);
        USDT.approve(address(hundi), price);
        hundi.fund(id, FACE);
        vm.stopPrank();
        assertEq(USDT.balanceOf(exporter), price);
        assertEq(hundi.balanceOf(investor, id), FACE);

        vm.warp(block.timestamp + 1 hours);
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        assertEq(uint8(hundi.getInvoice(id).status), uint8(HundiInvoice.Status.Settled));
        assertEq(USDT.balanceOf(investor), FACE - price + FACE);
        assertEq(USDT.balanceOf(importer), 0);
    }

    function test_fundWithPermitOnRealUsdt() public {
        vm.prank(exporter);
        uint256 id =
            hundi.issue(importer, FACE, uint64(block.timestamp + 1 hours), 400, keccak256("IRN-PERMIT"), bytes32(0));
        vm.prank(importer);
        hundi.acknowledge(id);

        uint256 price = hundi.quote(id, FACE);
        uint256 deadline = block.timestamp + 10 minutes;
        bytes32 typehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(
            abi.encode(
                typehash, investor, address(hundi), price, IERC20Permit(address(USDT)).nonces(investor), deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", IERC20Permit(address(USDT)).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(investorKey, digest);

        vm.prank(investor);
        hundi.fundWithPermit(id, FACE, deadline, v, r, s);
        assertEq(hundi.balanceOf(investor, id), FACE);
        assertEq(USDT.balanceOf(exporter), price);
    }

    function test_shortPaymentDefaultsOnRealUsdt() public {
        vm.prank(exporter);
        uint256 id =
            hundi.issue(importer, FACE, uint64(block.timestamp + 1 hours), 400, keccak256("IRN-DEFAULT"), bytes32(0));
        vm.startPrank(importer);
        hundi.acknowledge(id);
        USDT.approve(address(hundi), FACE / 2);
        vm.stopPrank();

        vm.startPrank(investor);
        USDT.approve(address(hundi), hundi.quote(id, FACE));
        hundi.fund(id, FACE);
        vm.stopPrank();
        uint256 before = USDT.balanceOf(investor);

        vm.warp(block.timestamp + 1 hours + 60);
        hundi.settle(id);
        hundi.distribute(id, 0, 10);
        assertEq(uint8(hundi.getInvoice(id).status), uint8(HundiInvoice.Status.Defaulted));
        assertEq(USDT.balanceOf(investor), before + FACE / 2);
    }
}
