import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";

describe("SwapMath", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("SwapMathTest");
        const swapMath = await contractFactory.deploy();
        await swapMath.deployed();
        return {swapMath};
    }

    describe("#computeSwapStep", () => {
        describe("exact in", () => {
            describe("price limit x96 not in range", () => {
                describe("lte == true", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79228162514264337593543950336n,
                            78596890917707242254600480479n,
                            505,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=505+*+Divide%5B%5C%2840%291e6-1e4%5C%2841%29%2C1e6%5D
                        expect(amountIn).to.equal(499);
                        expect(feeAmount).to.equal(505 - amountIn.toNumber());
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%292*499*79234500767265478740551433853%5C%2841%29%2C2*%5C%2840%291%3C%3C96%5C%2841%29-%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B499%2C1000%5D%5D
                        expect(amountOut).to.equal(499);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B499%2C1000%5D
                        expect(priceNextX96).to.equal(79231337979017909308194699578n);
                    });

                    it("fully filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79228162514264337593543950336n,
                            78596890917707242254600480479n,
                            1011,
                            1000,
                            1e4
                        );

                        // https://www.wolframalpha.com/input?i2d=true&i=1011*Divide%5B%5C%2840%291e6-1e4%5C%2841%29%2C1e6%5D
                        expect(amountIn).to.equal(1000);
                        expect(feeAmount).to.equal(1011 - amountIn.toNumber());
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%292*1000*79234500767265478740551433853%5C%2841%29%2C2*%5C%2840%291%3C%3C96%5C%2841%29-%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B1000%2C1000%5D%5D
                        expect(amountOut).to.equal(1000);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B1000%2C1000%5D
                        expect(priceNextX96).to.equal(79228162514264337593543950336n);
                    });

                    it("fully filled with too much amount input", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79228162514264337593543950336n,
                            78596890917707242254600480479n,
                            11111,
                            1000,
                            1e4
                        );

                        expect(amountOut).to.equal(1000);
                        expect(amountIn).to.equal(1000);
                        expect(feeAmount).to.equal(11);
                        expect(priceNextX96).to.equal(79228162514264337593543950336n);
                    });
                });
            });

            describe("price limit x96 in range", () => {
                describe("lte == true", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79259858850278108659759305076n,
                            79228162514264337593543950336n,
                            79234500767265478740551433853n,
                            1000,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=1000*Divide%5B%5C%2840%2979234500767265478740551433853-79259858850278108659759305076%5C%2841%29%2C%5C%2840%2979228162514264337593543950336-79259858850278108659759305076%5C%2841%29%5D
                        expect(amountOut).to.equal(801);
                        // https://www.wolframalpha.com/input?i2d=true&i=79259858850278108659759305076%2B%5C%2840%2979228162514264337593543950336-79259858850278108659759305076%5C%2841%29*Divide%5B801%2C1000%5D
                        expect(priceNextX96).to.equal(79234470085131078035720805929n);
                        expect(priceNextX96).to.lessThan(79234500767265478740551433853n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B801*%5C%2840%291%3C%3C96%5C%2841%29%2C79247164467704593347740055502%5D
                        expect(amountIn).to.equal(801);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B801%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(9);
                    });

                    it("partial filled with too much amount input", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79259858850278108659759305076n,
                            79228162514264337593543950336n,
                            79251930963018616894822013521n,
                            11111,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=1000*Divide%5B%5C%2840%2979251930963018616894822013521-79259858850278108659759305076%5C%2841%29%2C%5C%2840%2979228162514264337593543950336-79259858850278108659759305076%5C%2841%29%5D
                        expect(amountOut).to.equal(251);
                        expect(priceNextX96).to.equal(79251903069938652122139251036n);
                        expect(priceNextX96).to.lessThan(79251930963018616894822013521n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B251*%5C%2840%291%3C%3C96%5C%2841%29%2C79228162514264337593543950336%5D
                        expect(amountIn).to.equal(251);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B251%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(3);
                    });
                });

                describe("lte == false", () => {
                    it("partial filled with too much amount input", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79291567866855013031014398182n,
                            79259858850278108659759305076n,
                            11111,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=1000*Divide%5B%5C%2840%2979259858850278108659759305076-79234500767265478740551433853%5C%2841%29%2C%5C%2840%2979291567866855013031014398182-79234500767265478740551433853%5C%2841%29%5D
                        expect(amountOut).to.equal(445);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979291567866855013031014398182-79234500767265478740551433853%5C%2841%29*Divide%5B445%2C1000%5D
                        expect(priceNextX96).to.equal(79259895626582821499807452980n);
                        expect(priceNextX96).to.greaterThan(79259858850278108659759305076n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B445*79247198196924150120179443417%2C1%3C%3C96%5D
                        expect(amountIn).to.equal(446);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B446%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(5);
                    });
                });
            });

            it("price and amount is very large", async () => {
                const {swapMath} = await loadFixture(deployFixture);
                const {
                    amountIn: expectAmountIn,
                    feeAmount: expectFeeAmount,
                    amountOut: expectAmountOut,
                } = await swapMath.computeSwapStep(
                    236100263702020925593350088815716n,
                    236289211924366519752705405426501n,
                    236289211924366519752705405426501n,
                    -2165,
                    10n ** 18n * 10n * 100000000n,
                    1e4
                );
                const {amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                    236100263702020925593350088815716n,
                    236289211924366519752705405426501n,
                    236289211924366519752705405426501n,
                    expectAmountIn.add(expectFeeAmount),
                    10n ** 18n * 10n * 100000000n,
                    1e4
                );
                expect(amountIn).to.equal(expectAmountIn);
                expect(feeAmount).to.equal(expectFeeAmount);
                expect(amountOut).to.equal(expectAmountOut);
            });

            it("price and amount is very small", async () => {
                const {swapMath} = await loadFixture(deployFixture);
                const {
                    amountIn: expectAmountIn,
                    feeAmount: expectFeeAmount,
                    amountOut: expectAmountOut,
                } = await swapMath.computeSwapStep(
                    19808354182490086n,
                    19812316051410125n,
                    19812316051410125n,
                    249069n,
                    10n ** 18n,
                    500
                );
                const {amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                    19808354182490086n,
                    19812316051410125n,
                    19812316051410125n,
                    expectAmountOut.toBigInt() * -1n,
                    10n ** 18n,
                    500
                );
                expect(amountIn.sub(expectAmountIn)).to.lessThanOrEqual(1n);
                expect(amountOut).to.equal(expectAmountOut);
                expect(feeAmount).to.equal(expectFeeAmount);
            });
        });

        describe("exact out", () => {
            describe("price limit x96 not in range", () => {
                describe("lte == true", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79228162514264337593543950336n,
                            78596890917707242254600480479n,
                            -499,
                            1000,
                            1e4
                        );
                        expect(amountOut).to.equal(499);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B499%2C1000%5D
                        expect(priceNextX96).to.equal(79231337979017909308194699578n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979231337979017909308194699578%2B79234500767265478740551433853%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79232919373141694024373066715n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B499*%5C%2840%291%3C%3C96%5C%2841%29%2C79232919373141694024373066715%5D
                        expect(amountIn).to.equal(499);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B499%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(6);
                    });

                    it("fully filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79228162514264337593543950336n,
                            78596890917707242254600480479n,
                            -1000,
                            1000,
                            1e4
                        );
                        expect(amountOut).to.equal(1000);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B1000%2C1000%5D
                        expect(priceNextX96).to.equal(79228162514264337593543950336n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979228162514264337593543950336%2B79234500767265478740551433853%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79231331640764908167047692094n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B1000*%5C%2840%291%3C%3C96%5C%2841%29%2C79231331640764908167047692094%5D
                        expect(amountIn).to.equal(1000);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B1000%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(11);
                    });
                });

                describe("lte == false", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79291567866855013031014398182n,
                            79864504334642843207410872765n,
                            -499,
                            1000,
                            1e4
                        );
                        expect(amountOut).to.equal(499);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979228162514264337593543950336-79234500767265478740551433853%5C%2841%29*Divide%5B499%2C1000%5D
                        expect(priceNextX96).to.equal(79262977249960656351492453054n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979262977249960656351492453054%2B79234500767265478740551433853%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79248739008613067546021943454n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B499*79232919373141694024373066716%2C1%3C%3C96%5D
                        expect(amountIn).to.equal(500);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B500%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(6);
                    });

                    it("fully filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79291567866855013031014398182n,
                            79864504334642843207410872765n,
                            -1000,
                            1000,
                            1e4
                        );
                        expect(amountOut).to.equal(1000);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979291567866855013031014398182-79234500767265478740551433853%5C%2841%29*Divide%5B1000%2C1000%5D
                        expect(priceNextX96).to.equal(79291567866855013031014398182n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979291567866855013031014398182%2B79234500767265478740551433853%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79263034317060245885782916018n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B1000*79263034317060245885782916018%2C1%3C%3C96%5D
                        expect(amountIn).to.equal(1001);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B1001%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(11);
                    });

                    it("current price is very large", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            1451025756579852904068226767905904590329504960019n,
                            1456841250223135307985686533054290117107222940551n,
                            1461393510669492356804678698233615530275120997307n,
                            -10000000n,
                            100000000000000000000n,
                            5000
                        );
                        expect(amountOut).to.equal(10000000n);
                        expect(priceNextX96).to.equal(1451025756579853485617591096146296336306019798572n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B10000000*1451025756579853194842908932026109295233974710895%2C1%3C%3C96%5D
                        expect(amountIn).to.equal(183145198693533842913848194n);
                        expect(feeAmount).to.equal(920327631625798205597228n);
                    });
                });
            });

            describe("price limit x96 in range", () => {
                describe("lte == true", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79259858850278108659759305076n,
                            79228162514264337593543950336n,
                            79234500767265478740551433853n,
                            -1000,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=1000*Divide%5B%5C%2840%2979234500767265478740551433853-79259858850278108659759305076%5C%2841%29%2C%5C%2840%2979228162514264337593543950336-79259858850278108659759305076%5C%2841%29%5D
                        expect(amountOut).to.equal(801);
                        // https://www.wolframalpha.com/input?i2d=true&i=79259858850278108659759305076%2B%5C%2840%2979228162514264337593543950336-79259858850278108659759305076%5C%2841%29*Divide%5B801%2C1000%5D
                        expect(priceNextX96).to.equal(79234470085131078035720805929n);
                        expect(priceNextX96).to.lessThan(79234500767265478740551433853n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979234470085131078035720805929%2B79259858850278108659759305076%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79247164467704593347740055502n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B801*%5C%2840%291%3C%3C96%5C%2841%29%2C79247164467704593347740055502%5D
                        expect(amountIn).to.equal(801);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B801%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(9);
                    });
                });

                describe("lte == false", () => {
                    it("partial filled", async () => {
                        const {swapMath} = await loadFixture(deployFixture);
                        const {priceNextX96, amountIn, amountOut, feeAmount} = await swapMath.computeSwapStep(
                            79234500767265478740551433853n,
                            79291567866855013031014398182n,
                            79259858850278108659759305076n,
                            -1000,
                            1000,
                            1e4
                        );
                        // https://www.wolframalpha.com/input?i2d=true&i=1000*Divide%5B%5C%2840%2979259858850278108659759305076-79234500767265478740551433853%5C%2841%29%2C%5C%2840%2979291567866855013031014398182-79234500767265478740551433853%5C%2841%29%5D
                        expect(amountOut).to.equal(445);
                        // https://www.wolframalpha.com/input?i2d=true&i=79234500767265478740551433853%2B%5C%2840%2979291567866855013031014398182-79234500767265478740551433853%5C%2841%29*Divide%5B445%2C1000%5D
                        expect(priceNextX96).to.equal(79259895626582821499807452980n);
                        expect(priceNextX96).to.greaterThan(79259858850278108659759305076n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B%5C%2840%2979259895626582821499807452980%2B79234500767265478740551433853%5C%2841%29%2C2%5D
                        // expect(priceAvgX96).to.equal(79247198196924150120179443417n);
                        // https://www.wolframalpha.com/input?i2d=true&i=Divide%5B445*79247198196924150120179443417%2C1%3C%3C96%5D
                        expect(amountIn).to.equal(446);
                        // https://www.wolframalpha.com/input?i2d=true&i=1e4*Divide%5B446%2C%5C%2840%291e6-1e4%5C%2841%29%5D
                        expect(feeAmount).to.equal(5);
                    });
                });
            });
        });
    });
});
