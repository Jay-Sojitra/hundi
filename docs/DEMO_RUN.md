# Lifecycle run on Whitechain Sepolia

Produced by `scripts/demo.ts` with the USDT at `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

- HundiInvoice: [0xbEaC6bCec891bC4F04bBD5b686fB4E02e22a8F31](https://explorer.testnet.whitechain.io/address/0xbEaC6bCec891bC4F04bBD5b686fB4E02e22a8F31)
- ParticipantRegistry: [0x7a4C69634E2FC1B17C3b3FF25e72bB8bb56e8484](https://explorer.testnet.whitechain.io/address/0x7a4C69634E2FC1B17C3b3FF25e72bB8bb56e8484)

## Verifier approves participants
- Approve EXPORTER: [tx](https://explorer.testnet.whitechain.io/tx/0x7d2e507be0734b6b69f46e99a471be27c43363fef072e561245e1984c04601b9)
- Approve IMPORTER: [tx](https://explorer.testnet.whitechain.io/tx/0xdc3ea14e6891fd52c06be79c769d968e1718d8fcd3bfcc21a92727d4189031b0)
- Approve INVESTOR_A: [tx](https://explorer.testnet.whitechain.io/tx/0x3a941362d17131da41c48f1d101ab48d131336eef8c1398e9b444ffbd0e4bfad)
- Approve INVESTOR_B: [tx](https://explorer.testnet.whitechain.io/tx/0x9ec694e02cc4722b314fda65f8718c9a465a404d489b89d38e163a8e7d19c228)

## Invoice 1: issue to settlement
- Exporter issues the invoice: [tx](https://explorer.testnet.whitechain.io/tx/0x30af12bd32bed3f288e9b9d08a6550e625c53940a5cec2c9f803a46c840f3108)
- Exporter tries to issue the same invoice again (R2): [tx](https://explorer.testnet.whitechain.io/tx/0x2621b381494e09ee6d3eb6b487a9d66401632845847b8d02c4e90a1de1bf69c8) **Reverted as intended: DuplicateInvoice**
- Investor tries to fund before the importer confirms (R3): [tx](https://explorer.testnet.whitechain.io/tx/0x808b0347f71be78d2650c298090ae1c91fef42dd468a84265e1d5529a2e537b3) **Reverted as intended: NotAcknowledged**
- Importer acknowledges the invoice: [tx](https://explorer.testnet.whitechain.io/tx/0xf03558627f064a27aca3f382c7b06daecb2c264c16bffebbaaf9dfe749ba6594)
- Importer approves USDT for repayment on the due date: [tx](https://explorer.testnet.whitechain.io/tx/0x915caed092be75ea9e9c64050f2b86a424588312eef5bf8b4ef9b901714169f9)
- Investor A buys 60% at a 4% discount: units and USDT move in one transaction (R6): [tx](https://explorer.testnet.whitechain.io/tx/0x67f4a4ae8422ba0d188e3324a6692b58dde32c415a3a3ea3b075ceec46fae2ae) Pays 2.88 USDT for 3 USDT of face value
- Investor A tries to transfer to an unverified wallet (R4): [tx](https://explorer.testnet.whitechain.io/tx/0x3b2dbddd3bec61b72e12d126b20dfd62b983139812a8fcea15d2b43753af166e) **Reverted as intended: TransferNotAllowed**
- Investor A sells half to verified Investor B: [tx](https://explorer.testnet.whitechain.io/tx/0x3281827c6f430c38cce1207227a6afaa9df25269a74654c3ecc4c00dbab83b60)
- Investor A tries to transfer after the due date (R5): [tx](https://explorer.testnet.whitechain.io/tx/0x48207e689178cca31fb5c8c9093ea78659398d167163f70896bf4d0f0f759446) **Reverted as intended: PastDueDate**
- Keeper settles: USDT is pulled from the importer into the contract (R7): [tx](https://explorer.testnet.whitechain.io/tx/0x23dc5327fb469500ec5897328154cccf78b3963e7e03a2bc53fefe652f97890c)
- Keeper distributes: holders are paid with no action from them: [tx](https://explorer.testnet.whitechain.io/tx/0xa8402f266fdded41c10a3c8a9cca721f5c09f18015741ed5fb3287513cce7128)
- Investor A received 1.5 USDT, Investor B received 1.5 USDT

## Invoice 2: short payment and default
- Exporter issues a second invoice: [tx](https://explorer.testnet.whitechain.io/tx/0x44e54c46e928e6ecf6f92ece398c2881f36be6822780fb02b6475eeac03cdb17)
- Importer acknowledges the invoice: [tx](https://explorer.testnet.whitechain.io/tx/0x6bc130aca1a4dd08b20470f9ef3a664e54637ba03100c0c000a734ae1729e39a)
- Importer approves only half of what it owes: [tx](https://explorer.testnet.whitechain.io/tx/0x650d394c0e2cb1a432d208922b809c08cdf80eb596923c934091289d488598ff)
- Investor B funds the whole invoice: [tx](https://explorer.testnet.whitechain.io/tx/0xb1fcd87fec2f1a075644063e0f60a8d7769a0aa98738eb2dbdb856af5ada098e)
- Keeper settles: short payment after grace marks it Defaulted: [tx](https://explorer.testnet.whitechain.io/tx/0x30bb9729ad84b88b6e8722b9946c1989ea70e7aa89047f74f952a4055d7055da)
- Keeper distributes the partial recovery pro rata (R8): [tx](https://explorer.testnet.whitechain.io/tx/0xd298ed5a0281755d5407d77cb4be6cc32332183009edb43864c3b10d75cad59c)
- Investor B recovered 1 of 2 USDT
