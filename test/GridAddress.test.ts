import {ethers} from "hardhat";
import {expect} from "./shared/expect";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {GridAddressTest} from "../typechain-types";
import {Resolution} from "./shared/util";
import {computeAddress, GRID_BYTES_CODE_HASH} from "./shared/GridAddress";

describe("GridAddress", () => {
    const tokenAddresses = ["0x1000000000000000000000000000000000000000", "0x2000000000000000000000000000000000000000"];
    const gridFactoryAddress = "0x9000000000000000000000000000000000000000";

    async function deployFixture() {
        const [signer, otherAccount] = await ethers.getSigners();
        const gridAddressFactory = await ethers.getContractFactory("GridAddressTest", signer);
        const gridAddress = (await gridAddressFactory.deploy()) as GridAddressTest;
        return {gridAddress, signer, otherAccount};
    }

    describe("#GRID_BYTES_CODE_HASH", () => {
        it(`grid bytes code hash should equal to ${GRID_BYTES_CODE_HASH}`, async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            expect(await gridAddress.GRID_BYTES_CODE_HASH()).to.equal(GRID_BYTES_CODE_HASH);
        });
    });

    describe("#gridKey", () => {
        it("should sort by order", async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            const {key} = await gridAddress.gridKey(tokenAddresses[0], tokenAddresses[1], Resolution.LOW);
            expect(key.token0).to.equal(tokenAddresses[0]);
            expect(key.token1).to.equal(tokenAddresses[1]);
            expect(key.resolution).to.equal(Resolution.LOW);
        });

        it("should sort by order", async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            const {key} = await gridAddress.gridKey(tokenAddresses[1], tokenAddresses[0], Resolution.HIGH);
            expect(key.token0).to.equal(tokenAddresses[0]);
            expect(key.token1).to.equal(tokenAddresses[1]);
            expect(key.resolution).to.equal(Resolution.HIGH);
        });

        it("gas used snapshot", async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            const {gasUsed} = await gridAddress.gridKey(tokenAddresses[1], tokenAddresses[0], Resolution.LOW);
            expect(gasUsed.toNumber()).toMatchSnapshot();
        });
    });

    describe("#computeAddress", () => {
        it("should revert if token0 > token1", async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            await expect(
                gridAddress.computeAddress(gridFactoryAddress, {
                    token0: tokenAddresses[1],
                    token1: tokenAddresses[0],
                    resolution: Resolution.MEDIUM,
                })
            ).to.reverted;
        });

        it("should equal on chain and off chain", async () => {
            const {gridAddress} = await loadFixture(deployFixture);
            const onChainAddress = await gridAddress.computeAddress(gridFactoryAddress, {
                token0: tokenAddresses[0],
                token1: tokenAddresses[1],
                resolution: Resolution.MEDIUM,
            });
            const offChainAddress = await computeAddress(
                gridFactoryAddress,
                tokenAddresses[0],
                tokenAddresses[1],
                Resolution.MEDIUM
            );
            expect(onChainAddress).to.equal(offChainAddress);
        });
    });
});
