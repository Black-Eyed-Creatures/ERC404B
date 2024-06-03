# ERC404B

ERC404 is an experimental token standard on the Ethereum blockchain that combines features of both fungible (ERC-20) and non-fungible (ERC-721) tokens. This hybrid approach aims to create "semi-fungible" tokens, which can represent both unique and divisible assets.

ERC404 allows for fractional ownership and improved liquidity of NFTs, addressing some of the limitations of existing token standards by enabling more flexible and innovative use cases in digital asset management and decentralized finance.

**ERC404B** is inspired by the contracts [ERC721psi](https://github.com/estarriolvetch/ERC721Psi) and [ERC404 from Pandora Labs](https://github.com/Pandora-Labs-Org/erc404). Our goal with ERC404B is to combine the initial implementation structure of the ERC404 contract from Pandora Labs, with the gas consumption improvements for multi-token transactions introduced by ERC721psi.

## Contributors

For those who wish to contribute to the project, here are the instructions for interacting and/or adding functionality:

1. Clone this repository to your local machine.

2. Add a `.env` file to the root folder. The format of the file should be:

    ```shell
    WEB3_RPC_URL=
    COINMARKETCAP_API_KEY=
    ```

    - `WEB3_RPC_URL` is the URL of the JSON RPC node to connect with during task execution (Infura, Alchemy, etc.).
    - `COINMARKETCAP_API_KEY` is optional. Go to [Coin Market Cap](https://coinmarketcap.com/) to get an API key. This key is used by the gas reporter to display transaction costs in the configured currency.

3. Set up `nvm`:

   ```bash
   nvm install
   nvm use
   ```

4. Install dependencies using yarn:

   ```bash
   yarn install
   ```

5. Follow best development practices and ensure your code passes all tests before submitting a pull request.

## License

This project is licensed under the MIT License. For more information, see the [LICENSE](./LICENSE) file.
