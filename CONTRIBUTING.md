# Contributing

## Development

1. The latest state of the code is on the `main` branch.
2. Create a new branch for each feature or issue you are working on.
3. Do the work, write [good commit messages](https://chris.beams.io/posts/git-commit/), and read
   the [style guide](https://solidity.readthedocs.io/en/v0.8.6/style-guide.html).
4. Submit a pull request.
5. Pull requests should pass all CI tests before being merged.
6. Pull requests should be reviewed by at least one other developer.
7. Pull requests are merged into `main` by a maintainer after being reviewed.
8. If you are a maintainer, please use "Squash and merge" to merge the pull request.
9. Delete the branch after the pull request is merged.

## How to compile or test the contracts

### Pre Requisites

Before running any command, you need to create a `.env` file and set a `PRIVATE_KEY`, for example:

```
PRIVATE_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

### Deploy

Deploy the contracts to Hardhat Network:

```sh
$ npx hardhat run scripts/deploy.ts --network goerli
```

### Verify

Verify the contracts to XXXScan like etherscan:

```sh
$ npx hardhat verify --network polygon --contract contracts/gridex.sol:Gridex <Contract Address>
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ npx hardhat compile
```

### Lint Solidity

Lint the Solidity code:

```sh
$ npx hardhat check
```

### Test

Run the Mocha tests:

```sh
$ npx hardhat test
```

### Coverage

Generate the code coverage report:

```sh
$ ./coverage.sh
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true npx hardhat test
```

### Report Size

Output Solidity contract size with hardhat:

```shell
$ REPORT_SIZE=true npx hardhat compile
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ npx hardhat clean
```
