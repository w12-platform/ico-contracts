import EVMRevert from './helpers/EVMRevert';
import latestTime from './helpers/latestTime';
import ether from './helpers/ether';
import { increaseTimeTo, duration } from './helpers/increaseTime';
import moment from 'moment';

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const billion = new BigNumber(10).pow(9);
const million = new BigNumber(10).pow(6);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Crowdsale parameters starts --->

const TEAM_ADDRESS           = '0x0000000000000000000000000000000000000002';
const RESERVE_ADDRESS        = '0x0000000000000000000000000000000000000003';
const SEED_INVESTORS_ADDRESS = '0x0000000000000000000000000000000000000004';
const PARTNERS_ADDRESS       = '0x0000000000000000000000000000000000000005';
const BOUNTY_ADDRESS         = '0x0000000000000000000000000000000000000006';
const AIRDROP_ADDRESS        = '0x0000000000000000000000000000000000000007';

const PRESALE_START_DATE = 1526817600;
const PRESALE_END_DATE = 1532088000;

const CROWDSALE_START_DATE = 1532692800;
const CROWDSALE_END_DATE = 1538049600;

// Crowdsale parameters ends <---

const W12Token = artifacts.require('W12Token');
const W12Crowdsale = artifacts.require('W12Crowdsale');

contract('W12Crowdsale', async (accounts) => {
    let token;
    let sut;
    let tokenDecimalsMultiplicator;

    const receivers = accounts.slice(1);
    let owner = accounts[0];

    describe('crowdsale', async () => {
        beforeEach(async () => {
            sut = await W12Crowdsale.new({ gasLimit: 6000000 });
            token = W12Token.at(await sut.token());
            tokenDecimalsMultiplicator = new BigNumber(10).pow(await token.decimals());
        });

        it('should set owner', async () => {
            (await sut.owner()).should.be.equal(owner);
        });

        it('should set initial params accrodingly to tokensale agreement', async () => {
            (await sut.presaleStartDate()).should.bignumber.equal(PRESALE_START_DATE);
            (await sut.presaleEndDate()).should.bignumber.equal(PRESALE_END_DATE);

            (await sut.crowdsaleStartDate()).should.bignumber.equal(CROWDSALE_START_DATE);
            (await sut.crowdsaleEndDate()).should.bignumber.equal(CROWDSALE_END_DATE);

            (await sut.presaleTokenBalance()).should.bignumber.equal(million.mul(20).mul(tokenDecimalsMultiplicator));
            (await sut.crowdsaleTokenBalance()).should.bignumber.equal(million.mul(80).mul(tokenDecimalsMultiplicator));
        });

        it('should conduct initial distribution in accordance with tokensale agreement', async () => {
            (await token.balanceOf(sut.address)).should.bignumber.equal(
                million.mul(100).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(TEAM_ADDRESS)).should.bignumber.equal(
                million.mul(60).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(RESERVE_ADDRESS)).should.bignumber.equal(
                million.mul(60).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(SEED_INVESTORS_ADDRESS)).should.bignumber.equal(
                million.mul(20).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(PARTNERS_ADDRESS)).should.bignumber.equal(
                million.mul(8).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(BOUNTY_ADDRESS)).should.bignumber.equal(
                million.mul(8).mul(tokenDecimalsMultiplicator)
            );
    
            (await token.balanceOf(AIRDROP_ADDRESS)).should.bignumber.equal(
                million.mul(4).mul(tokenDecimalsMultiplicator)
            );
        });

        it('should change sale dates and activates specific stage when instructed', async () => {
            let stage;
            let rate;

            stage = await sut.getStage();
            stage.should.bignumber.equal(0);

            const latestTime = await web3.eth.getBlock('latest').timestamp;

            await sut.setPresaleStartDate(latestTime).should.be.fulfilled;
            await sut.setPresaleEndDate(latestTime + 1000000).should.be.fulfilled;

            stage = await sut.getStage();
            rate = await sut.getCurrentRate();

            stage.should.bignumber.equal(1);
            rate.should.bignumber.equal(234500000000000);

            await sut.setPresaleStartDate(latestTime - 2000000).should.be.fulfilled;
            await sut.setPresaleEndDate(latestTime + 1000000).should.be.fulfilled

            stage = await sut.getStage();
            rate = await sut.getCurrentRate();

            stage.should.bignumber.equal(2);
            rate.should.bignumber.gte(262500000000000);
            rate.should.bignumber.lte(297500000000000);

            await sut.setPresaleEndDate(latestTime - 1000).should.be.fulfilled
            await sut.setCrowdsaleStartDate(latestTime).should.be.fulfilled;
            await sut.setCrowdsaleEndDate(latestTime + 1000000).should.be.fulfilled;

            stage = await sut.getStage();
            rate = await sut.getCurrentRate();

            stage.should.bignumber.equal(3);
            rate.should.bignumber.gte(315000000000000);
            rate.should.bignumber.lte(350000000000000);
        });

        describe('when presale is on', async () => {
            const presaleLenght = duration.days(6 * 7) * 1000;
            const oneEther = ether(1);

            beforeEach(async () => {
                const latestTime = await web3.eth.getBlock('latest').timestamp;

                await sut.setPresaleStartDate(latestTime);
                await sut.setPresaleEndDate(latestTime + 1000000);
            });

            it('should receive Ether', async () => {
                await sut.sendTransaction({ value: oneEther }).should.be.fulfilled;
            });

            it('should send tokens to buyer', async () => {
                await sut.sendTransaction({ value: oneEther });
                (await token.balanceOf(accounts[0])).should.bignumber.gt(0);
            });

            it('should decrease supply of tokens for sale by amount bought', async () => {
                const supplyBefore = await sut.presaleTokenBalance();

                await sut.sendTransaction({ value: oneEther });
                const bought = await token.balanceOf(accounts[0]);
                (await sut.presaleTokenBalance()).should.bignumber.equal(supplyBefore.minus(bought));
            });

            it('should sell tokens with maximum discount at day one', async () => {
                const expectedTokensBought = oneEther.div(ether(0.0002345)).mul(tokenDecimalsMultiplicator);

                await sut.sendTransaction({ value: oneEther });
                const actualTokensBought = await token.balanceOf(accounts[0]);

                actualTokensBought.should.bignumber.equal(expectedTokensBought.toPrecision(22));
            });

            it('should sell presale cap in a single transaction with maximum discount at day one', async () => {
                const expectedTokensBought = million.mul(20).mul(tokenDecimalsMultiplicator);

                await sut.sendTransaction({ value: oneEther.mul(4690) }).should.be.fulfilled;
                const actualTokensBought = await token.balanceOf(accounts[0]);

                actualTokensBought.should.bignumber.equal(expectedTokensBought);
                (await sut.presaleTokenBalance()).should.bignumber.equal(0);
            });

            it('should not sell more than presale cap', async () => {
                await sut.sendTransaction({ value: oneEther.mul(4691) }).should.be.rejected;
            });
        });
    });
});
