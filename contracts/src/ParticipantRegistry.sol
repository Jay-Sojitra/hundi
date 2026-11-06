// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ParticipantRegistry
/// @notice KYB allowlist for Hundi. A verifier records who may act as an exporter,
///         importer or investor, until when, and can freeze an account.
contract ParticipantRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint8 public constant ROLE_EXPORTER = 1;
    uint8 public constant ROLE_IMPORTER = 2;
    uint8 public constant ROLE_INVESTOR = 4;

    struct Participant {
        uint8 roles;
        uint64 expiresAt;
        bytes2 jurisdiction;
        bool frozen;
    }

    mapping(address account => Participant) private _participants;

    event ParticipantSet(address indexed account, uint8 roles, uint64 expiresAt, bytes2 jurisdiction);
    event FrozenSet(address indexed account, bool frozen);

    error InvalidParticipant();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    function setParticipant(address account, uint8 roles, uint64 expiresAt, bytes2 jurisdiction)
        external
        onlyRole(VERIFIER_ROLE)
    {
        if (account == address(0) || roles == 0 || roles > 7 || expiresAt <= block.timestamp) {
            revert InvalidParticipant();
        }
        Participant storage p = _participants[account];
        p.roles = roles;
        p.expiresAt = expiresAt;
        p.jurisdiction = jurisdiction;
        emit ParticipantSet(account, roles, expiresAt, jurisdiction);
    }

    function setFrozen(address account, bool frozen) external onlyRole(VERIFIER_ROLE) {
        _participants[account].frozen = frozen;
        emit FrozenSet(account, frozen);
    }

    /// @notice True if the account holds `role`, its approval has not expired and it is not frozen.
    function isEligible(address account, uint8 role) external view returns (bool) {
        Participant storage p = _participants[account];
        return p.roles & role != 0 && block.timestamp < p.expiresAt && !p.frozen;
    }

    function isFrozen(address account) external view returns (bool) {
        return _participants[account].frozen;
    }

    function getParticipant(address account) external view returns (Participant memory) {
        return _participants[account];
    }
}
