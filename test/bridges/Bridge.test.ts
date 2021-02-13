import '@nomiclabs/hardhat-waffle'
import { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import MerkleTree from '../../lib/MerkleTree'
import Transfer from '../../lib/Transfer'

import { fixture } from '../shared/fixtures'
import {
  setUpDefaults,
  revertSnapshot,
  takeSnapshot
} from '../shared/utils'
import { IFixture } from '../shared/interfaces'

import { CHAIN_IDS } from '../../config/constants'

describe('Bridge', () => {
  let _fixture: IFixture

  let mockBridge: Contract
  let transfers: Transfer[]

  let l2ChainId: BigNumber

  let beforeAllSnapshotId: string
  let snapshotId: string

  before(async () => {
    beforeAllSnapshotId = await takeSnapshot()

    l2ChainId = CHAIN_IDS.OPTIMISM.TESTNET_1
    _fixture = await fixture(l2ChainId)
    await setUpDefaults(_fixture, l2ChainId)
    ;({ mockBridge, transfers } = _fixture)
  })

  after(async() => {
    await revertSnapshot(beforeAllSnapshotId)
  })

  beforeEach(async() => {
    snapshotId = await takeSnapshot()
  })

  afterEach(async() => {
    await revertSnapshot(snapshotId)
  })

  /**
   * Happy Path
   */

  // TODO: Test settleBondedWithdrawals() (it was added with contract upgrades)

  it('Should get the correct transfer id', async () => {
    for (let i = 0; i < transfers.length; i++) {
      const transfer: Transfer = transfers[i]
      const expectedTransferId: Buffer = transfer.getTransferId()
      const transferId = await mockBridge.getTransferId(
        transfer.chainId,
        transfer.sender,
        transfer.recipient,
        transfer.amount,
        transfer.transferNonce,
        transfer.relayerFee,
        transfer.amountOutMin,
        transfer.deadline
      )
      expect(transferId).to.eq('0x' + expectedTransferId.toString('hex'))
    }
  })

  it('Should get the correct chainId', async () => {
    const expectedChainId = 1
    const chainId = await mockBridge.getChainId()
    expect(chainId).to.eq(expectedChainId)
  })

  /**
   * Non-Happy Path
   */

  it('Should not allow a withdrawal because of an invalid proof', async () => {
    const transfer: Transfer = transfers[0]
    const arbitraryRootHash: string =
      '0x7465737400000000000000000000000000000000000000000000000000000000'
    const arbitraryProof: string[] = [arbitraryRootHash, arbitraryRootHash]

    const expectedErrorMsg: string = 'BRG: Invalid transfer proof'

    await expect(
      mockBridge.withdraw(
        transfer.sender,
        transfer.recipient,
        transfer.amount,
        transfer.transferNonce,
        transfer.relayerFee,
        arbitraryRootHash,
        arbitraryProof
      )
    ).to.be.revertedWith(expectedErrorMsg)
  })

  it('Should not allow a withdrawal because the transfer root is not found', async () => {
    const transfer: Transfer = transfers[0]

    // Set up transfer
    transfer.chainId = await mockBridge.getChainId()
    transfer.amountOutMin = BigNumber.from(0)
    transfer.deadline = BigNumber.from(0)

    // TODO: This can use the helper function getRootHashFromTransferId()
    const transferId: Buffer = transfer.getTransferId()
    const tree: MerkleTree = new MerkleTree([transferId])
    const transferRootHash: Buffer = tree.getRoot()
    const proof: Buffer[] = tree.getProof(transferId)

    const expectedErrorMsg: string = 'BRG: Transfer root not found'

    // TODO: The second to last param should be the ID. How is this working with the hash?
    await expect(
      mockBridge.withdraw(
        transfer.sender,
        transfer.recipient,
        transfer.amount,
        transfer.transferNonce,
        transfer.relayerFee,
        transferRootHash,
        proof
      )
    ).to.be.revertedWith(expectedErrorMsg)
  })
})
