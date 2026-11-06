// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HundiInvoice} from "../src/HundiInvoice.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";

/// @notice Deploys Hundi using the Whitechain Sepolia USDT named by the prize rules.
contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("VERIFIER_KEY");
        IERC20 usdt = IERC20(vm.envAddress("USDT"));
        // Short for the demo. Production would use days.
        uint64 grace = uint64(vm.envOr("GRACE_PERIOD", uint256(60)));

        vm.startBroadcast(key);
        ParticipantRegistry registry = new ParticipantRegistry(vm.addr(key));
        HundiInvoice hundi = new HundiInvoice(registry, usdt, grace);
        vm.stopBroadcast();

        console2.log("ParticipantRegistry", address(registry));
        console2.log("HundiInvoice", address(hundi));
    }
}
