// contracts/erc404/IERC404B.sol
// SPDX-License-Identifier: MIT

/**

    /3333333     /33333333     /333333    
   | 33__  33   | 33_____/    /33__  33   
   | 33  \ 33   | 33         | 33  \__/   
   | 3333333    | 33333      | 33         
   | 33__  33   | 33__/      | 33         
   | 33  \ 33   | 33         | 33    33   
   | 3333333/   | 33333333   |  333333/   
   |_______/    |________/    \______/    

 # https://blackeyedcreatures.com

 */
pragma solidity ^0.8.25;

import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title IERC404B Interface
 * @dev Interface for a hybrid token contract combining ERC20 and ERC721 functionalities with a unique "stash" feature.
 * The stash is a holding area for tokens that are currently unowned but not burned, allowing for controlled management and re-distribution.
 * Supports ERC165 for interface detection and ERC20Permit for token allowance via signatures.
 */
interface IERC404B is IERC165, IERC20Permit {
 
  /// IERC20 + ERC721 Metadata Methods ///

  /**
   * @dev Returns the name of the token.
   */
  function name() external view returns (string memory);

  /**
   * @dev Returns the symbol of the token.
   */
  function symbol() external view returns (string memory);

  /**
   * @dev Returns the number of decimals used to get its user representation.
   * For example, if `decimals` equals `2`, a balance of `505` tokens should
   * be displayed to a user as `5.05` (`505 / 10 ** 2`).
   *
   * Tokens usually opt for a value of 18, imitating the relationship between
   * Ether and Wei. This is the default value returned by this function, unless
   * it's overridden.
   *
   * NOTE: This information is only used for _display_ purposes: it in
   * no way affects any of the arithmetic of the contract, including
   * {IERC20-balanceOf} and {IERC20-transfer}.
   */
  function decimals() external view returns (uint8);

  /**
   * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
   */
  function tokenURI(uint256 tokenId) external view returns (string memory);


  /// ERC721 Methods ///

  /**
   * @dev Returns the owner of the `tokenId` token.
   *
   * Requirements:
   * - `tokenId` must exist.
   */
  function ownerOf(uint256 tokenId) external view returns (address owner);

  /**
   * @dev Safely transfers `tokenId` token from `from` to `to`.
   *
   * Requirements:
   * - `from` cannot be the zero address.
   * - `to` cannot be the zero address.
   * - `tokenId` token must exist and be owned by `from`.
   * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
   * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.
   *
   * Emits a {Transfer} event.
   */
  function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;

  /**
   * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
   * are aware of the ERC721 protocol to prevent tokens from being forever locked.
   *
   * Requirements:
   * - `from` cannot be the zero address.
   * - `to` cannot be the zero address.
   * - `tokenId` token must exist and be owned by `from`.
   * - If the caller is not `from`, it must have been allowed to move this token by either {approve} or {setApprovalForAll}.
   * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.
   *
   * Emits a {Transfer} event.
   */
  function safeTransferFrom(address from, address to, uint256 tokenId) external;

  /**
   * @dev Approve or remove `operator` as an operator for the caller.
   * Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.
   *
   * Requirements:
   * - The `operator` cannot be the caller.
   *
   * Emits an {ApprovalForAll} event.
   */
  function setApprovalForAll(address operator, bool approved) external;

  /**
   * @dev Returns the account approved for `tokenId` token.
   *
   * Requirements:
   * - `tokenId` must exist.
   */
  function getApproved(uint256 tokenId) external view returns (address operator);

  /**
   * @dev Returns if the `operator` is allowed to manage all of the assets of `owner`.
   *
   * See {setApprovalForAll}
   */
  function isApprovedForAll(address owner, address operator) external view returns (bool);

  /// ERC20 Methods ///

  /**
   * @dev Returns the amount of ERC20 tokens in existence.
   */
  function totalSupply() external view returns (uint256);

  /**
   * @dev Moves `amountOrId` tokens from the caller's account to `to`.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * Emits {Transfer} events.
   */
  function transfer(address to, uint256 amountOrId) external returns (bool);

  /**
   * @dev Returns the remaining number of tokens that `spender` will be
   * allowed to spend on behalf of `owner` through {transferFrom}. This is
   * zero by default.
   *
   * This value changes when {approve} or {transferFrom} are called.
   */
  function allowance(address owner, address spender) external view returns (uint256);

  /// ERC404 Combined (Methods with similar interfaces and behavior in ERC20 & ERC721) ///

  /**
   * @dev Returns the amount of tokens owned by `account`.
   */
  function balanceOf(address account) external view returns (uint256 balance);

  /**
   * @dev Moves `amountOrId` tokens from `from` to `to` using the
   * allowance mechanism. `amountOrId` is then deducted from the caller's
   * allowance.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * WARNING: In case of Id, note that the caller is responsible to confirm that the recipient is capable of
   * receiving ERC721 or else they may be permanently lost. Usage of {safeTransferFrom} prevents loss, though
   * the caller must understand this adds an external call which potentially creates a reentrancy vulnerability.
   *
   * Requirements:
   * - `from` cannot be the zero address.
   * - `to` cannot be the zero address.
   * - `amountOrId` amount should be less or equal than balance OR tokenId must be owned by `from`.
   * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
   *
   * Emits {Transfer} events.
   */
  function transferFrom(address from, address to, uint256 amountOrId) external returns (bool);

  /**
   * @dev Sets `amountOrId` as the allowance of `spender` over the caller's tokens.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * IMPORTANT: Beware that changing an allowance with this method brings the risk
   * that someone may use both the old and the new allowance by unfortunate
   * transaction ordering. One possible solution to mitigate this race
   * condition is to first reduce the spender's allowance to 0 and set the
   * desired value afterwards:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   *
   * Emits an {Approval} event.
   */
  function approve(address spender, uint256 amountOrId) external returns (bool);


  /// ERC404 Specific ///

 /**
   * @notice Retrieves the equivalence between 1 ERC721 token and ERC20 needed for that token.
   * @dev This function returns the unit value used in conversions between ERC721 and ERC20 tokens.
   * @return The unit value representing the equivalence between 1 ERC721 token and ERC20.
   */
  function unit() external view returns (uint256);

    /**
   * @notice Checks if the specified token exists.
   *
   * A token is considered to exist if it has been minted using {_mint} and is not in the set of burned tokens.
   *
   * @param tokenId_ The ID of the token to check.
   * @return True if the token exists, false otherwise.
   */
  function exists(uint256 tokenId_) external view returns (bool);

  /**
   * @dev Checks if the specified address is exempt from ERC-721 transfers.
   * This function retrieves the exemption status for ERC-721 transfers for the given address.
   * 
   * @param target_ The address to check for ERC-721 transfer exemption.
   * @return isExempt True if the address is exempt from ERC-721 transfers, false otherwise.
   */
  function isERC721TransferExempt(address target_) external view returns (bool isExempt);

  /**
   * @dev Sets the exemption status for ERC-721 transfers for the caller.
   * 
   * Emits:
   * - {Transfer} event for each target_ ERC721 token from/to the stash.
   * 
   * @param state_ The new exemption state to set (true for exempt, false for non-exempt).
   */
  function setERC721TransferExempt(bool state_) external;

  /**
   * @dev Retrieves the IDs of ERC-721 tokens owned by a specific address.
   * 
   * @param owner_ The address for which ERC-721 token IDs are being retrieved.
   * @return ownedCreatureIds An array of uint256 representing the ERC-721 token IDs owned by the specified address.
   */
  function owned(address owner_) external view returns (uint256[] memory);

  /**
   * @dev External function to get the current stash address.
   * 
   * @return address Current stash address.
   */
  function stashAddress() external view returns (address);

  /**
   * @dev External function to get the current length of the stash queue.
   * 
   * @return uint256 Current length of the stash queue.
   */
  function stashLength() external view returns (uint256);

  /**
   * @dev External function to retrieve all tokens currently in the stash queue.
   * 
   * @return uint256[] An array containing all tokens currently in the stash queue.
   */
  function tokensInStash() external view returns (uint256[] memory);

  /**
   * @dev Public function to exchange an ERC-721 token with a token in the stash.
   * 
   * Requirements:
   * - The caller must be the owner or have approval to transfer the tokenId_.
   * - The stashTokenId_ must belong to the stash.
   * 
   * Emits:
   * - {Transfer} event for the token exchanged from the stash to the caller.
   * - {Transfer} event for the token exchanged from the caller to the stash.
   * 
   * @param tokenId_ The ID of the ERC-721 token to exchange.
   * @param index_ The index of the token at the stash to exchange with.
   */
  function exchangeWithStash(uint256 tokenId_, uint128 index_) external;
}
