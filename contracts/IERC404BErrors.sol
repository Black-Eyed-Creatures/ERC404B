// contracts/IERC404BErrors.sol
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

/**
 * @dev ERC404B3Errors interface defines custom error messages for the ERC404B3 contract.
 */
interface IERC404BErrors {

  /**
   * @dev Indicates that the specified token is not found in the stash.
   * @param stashTokenId The ID of the token in the stash.
   */
  error ERC404TokenNotInStash(uint256 stashTokenId);

  /**
   * @dev Indicates that the index value provided is not valid in the stash queue.
   * @param indexInQueue The index value in the queue.
   * @param stashTokenId The ID of the token in the stash.
   */
  error ERC404NotValidIndexValueInStash(uint128 indexInQueue, uint256 stashTokenId);

  /**
   * @dev Indicates that the transfer value is invalid.
   * @param value The invalid transfer value.
   */
  error ERC404InvalidTransferValue(uint256 value);

  /**
   * @dev Indicates that the target address is not eligible for ERC721 exemption.
   * @param target The address that is not eligible for exemption.
   */
  error ERC404InvalidERC721Exemption(address target);

  /**
   * @dev Indicates an overflow in the owned index.
   * @param index The index value causing the overflow.
   */
  error ERC404OwnedIndexOverflow(uint256 index);

  /**
   * @dev Indicates an invalid mint quantity for ERC721.
   */
  error ERC721InvalidMintQuantity();

  /**
   * @dev Indicates that the recipient address has not implemented ERC721Receiver.
   * @param to The recipient address.
   * @param tokenId The ID of the token being transferred.
   * @param quantity The quantity of tokens being transferred.
   * @param data Additional data for the transfer.
   */
  error ERC721ReceiverNotImplemented(address to, uint256 tokenId, uint256 quantity, bytes data);

  /**
   * @dev Indicates that the permit deadline has expired for EIP-2612 permit.
   * @param owner The owner of the tokens.
   * @param spender The spender of the tokens.
   * @param value The token value.
   * @param deadline The expired deadline.
   * @param v Signature parameter v.
   * @param r Signature parameter r.
   * @param s Signature parameter s.
   */
  error EIP2612PermitDeadlineExpired(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s);

  /**
   * @dev Indicates that the signer of the permit is invalid for EIP-2612 permit.
   * @param recoveredAddress The recovered signer address.
   * @param owner The owner of the tokens.
   * @param spender The spender of the tokens.
   * @param value The token value.
   * @param deadline The permit deadline.
   * @param v Signature parameter v.
   * @param r Signature parameter r.
   * @param s Signature parameter s.
   */
  error EIP2612InvalidSigner(address recoveredAddress, address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s);
}
