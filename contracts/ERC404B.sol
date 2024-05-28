// contracts/ERC404B.sol
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

import {IERC404B} from "./IERC404B.sol";
import {IERC404BErrors} from "./IERC404BErrors.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC20Errors, IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {DoubleEndedQueue} from "./lib/DoubleEndedQueue.sol";
import {BitMaps} from "solidity-bits/contracts/BitMaps.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Stash Contract
 * @dev This empty contract serves as the designated address for ERC721 tokens that have been minted but not yet burned and currently have no owner.
 */
contract Stash {}


/**
 * @title ERC404B Contract
 * @dev Implements the IERC404 interface to provide a hybrid token mechanism supporting both ERC-20 and ERC-721 functionalities.
 * This contract diverts tokens without current ownership to a "stash" address instead of sending them to the zero address (0x00) as is common with burns.
 * It also enables the actual burning of tokens, sending them irreversibly to the zero address.
 * Features include batch minting for ERC-721 tokens to optimize minting operations, gas savings optimizations, and support for EIP-2612 permit-based transactions.
 * @author https://42i.co
 */
contract ERC404B is IERC404B, IERC20Errors, IERC721Errors, IERC404BErrors {
  using Strings for uint256;
  using BitMaps for BitMaps.BitMap;
  using DoubleEndedQueue for DoubleEndedQueue.Uint256Deque; // DoubleEndedQueue.Uint32Deque would be great

  /// @dev Token Name.
  string private _name;

  /// @dev Token Symbol.
  string private _symbol;

  /// @dev Token decimal digits.
  uint8 private immutable _DECIMALS;

  /// @dev The number of ERC20 tokens required for one ERC721 token.
  uint256 private immutable _UNIT;

  /// @dev The number of tokens held by each address.
  mapping(address holder => uint256 balance) private _balances;

  /// @dev Identifier for the next token to mint.
  uint256 internal _nextTokenId = _startTokenId();

  /// @dev ERC721 token approvals.
  mapping(uint256 tokenId => address approvedAddress) private _tokenApprovals;

  /// @dev ERC721 operator approvals.
  mapping(address holder => mapping(address operator => bool approval)) private _operatorApprovals;

  /// @dev ERC20 token allowances.
  mapping(address holder => mapping(address operator => uint256 allowance)) private _allowances;  

  /// @dev Exempt addresses from ERC-721 transfers (e.g., pairs, routers) for gas savings.
  mapping(address holder => bool exempt) private _erc721TransferExempt;

  /// @dev Bitmask to extract lower 160 bits from a uint256.
  uint256 private constant _BITMASK_LOWER160BITS = (1 << 160) - 1;

  /// @dev Bitmask to extract upper 96 bits from a uint256.
  uint256 private constant _BITMASK_UPPER96BITS = ((1 << 96) - 1) << 160;

  /// @dev Array of owned ERC-721 token IDs, each position stores a batch of tokens with the initial ID (_BITMASK_LOWER160BITS) and quantity (_BITMASK_UPPER96BITS).
  mapping(address holder => uint256[] batchArray) private _owned;

  /// @dev Mapping storing in each position the owner address (_BITMASK_LOWER160BITS) and index of this batch in _owned (_BITMASK_UPPER96BITS).
  mapping(uint256 tokenId => uint256 addressAndPosition) private _ownedData;

  /// @dev Bitmap storing the head of the batches, indicating where the _ownedData is located.
  BitMaps.BitMap private _batchHead;

  /// @dev Bitmap representing burned tokens.
  BitMaps.BitMap private _burnedTokens;

  /// @dev Amount of burned tokens.
  uint256 private _burnedCount = 0;

  /// @dev Queue of ERC-721 tokens in the stash.
  DoubleEndedQueue.Uint256Deque private _stashQueue;

  /// @dev Transfer(address,address,uint256) hash signature.
  bytes32 private constant _TRANSFER_EVENT_SIGNATURE = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

  /// @dev Approval(address,address,uint256) hash signature.
  bytes32 private constant _APPROVAL_EVENT_SIGNATURE = 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925;

  /// @dev ApprovalForAll(address,address,bool) hash signature.
  bytes32 private constant _APPROVALFORALL_EVENT_SIGNATURE = 0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31;

  /// @dev Stash address for this token.
  address private immutable _STASH_ADDRESS;

  /// @dev EIP-2612 nonces.
  mapping(address => uint256) public nonces;

  /// @dev Initial chain id for EIP-2612 support.
  uint256 internal immutable _INITIAL_CHAIN_ID;

  /// @dev Initial domain separator for EIP-2612 support.
  bytes32 internal immutable _INITIAL_DOMAIN_SEPARATOR;


  /**
   * @dev Initializes the contract with token details and necessary parameters.
   * 
   * @param name_ The name of the token.
   * @param symbol_ The symbol of the token.
   * @param unit_ The equivalence between 1 ERC721 token and ERC20 needed for that token.
   */
  constructor(string memory name_, string memory symbol_, uint256 unit_) {
    _name = name_;
    _symbol = symbol_;

    _DECIMALS = 18;
    _UNIT = unit_ * 10 ** _DECIMALS;
    _STASH_ADDRESS = address(new Stash());

    // EIP-2612 initialization
    _INITIAL_CHAIN_ID = block.chainid;
    _INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();
  }

  /**
   * @dev Returns the starting token ID.
   * 
   * @return The starting token ID, which is set to 1 by default.
   * To change the starting token ID, please override this function.
   */
  function _startTokenId() internal pure returns (uint256) {
    return 1;
  }

  /**
   * @dev Returns the total number of tokens minted in the contract.
   * 
   * @return The total number of tokens minted.
   */
  function _totalMinted() internal view virtual returns (uint256) {
    return _nextTokenId - _startTokenId();
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId_) public view virtual returns (bool) {
    return interfaceId_ == type(IERC404B).interfaceId ||
           interfaceId_ == type(IERC165).interfaceId ||
           interfaceId_ == type(IERC20).interfaceId ||
           interfaceId_ == type(IERC721).interfaceId ||
           interfaceId_ == type(IERC721Receiver).interfaceId ||
           interfaceId_ == type(IERC721Metadata).interfaceId;
  }

  /// IERC20 + ERC721 Metadata Methods ///

  /**
   * @dev See {IERC404-name}.
   */
  function name() public view virtual override returns (string memory) {
    return _name;
  }

  /**
   * @dev See {IERC404-symbol}.
   */
  function symbol() public view virtual override returns (string memory) {
    return _symbol;
  }

  /**
   * @dev See {IERC404-decimals}.
   */
  function decimals() public view virtual override returns (uint8) {
    return _DECIMALS;
  }

  /**
   * @dev See {IERC404-unit}.
   */
  function unit() public view virtual returns (uint256) {
    return _UNIT;
  }

  /**
   * @dev See {IERC404-tokenURI}.
   */
  function tokenURI(uint256 tokenId_) public view virtual override returns (string memory) {
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    string memory baseURI = _baseURI();
    return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId_.toString())) : "";
  }

  /**
   * @dev Base URI for computing the {tokenURI}. If set, the resulting URI for each
   * token will be the concatenation of the `baseURI` and the `tokenId`. 
   * 
   * It is empty by default and can be overridden in child contracts.
   * @return The base URI string.
   */
  function _baseURI() internal view virtual returns (string memory) {
    return "";
  }

  /**
   * @dev Checks whether the specified `tokenId` exists in the contract.
   * Tokens start existing when they are minted using the {_mint} function. Burned tokens are not considered to exist.
   * 
   * @param tokenId_ The ID of the token to check.
   * @return A boolean indicating whether the token exists.
   */
  function _exists(uint256 tokenId_) internal view virtual returns (bool) {
    if (_burnedTokens.get(tokenId_)) {
      return false;
    }
    return tokenId_ < _nextTokenId && _startTokenId() <= tokenId_;
  }

  /**
   * @dev See {IERC404-exists}.
   */
  function exists(uint256 tokenId_) external view virtual returns (bool) {
    return _exists(tokenId_);
  }

  /// ERC721 Methods ///

  /**
   * @dev See {IERC404-ownerOf}.
   */
  function ownerOf(uint256 tokenId_) public view virtual override returns (address owner) {
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    uint256 data = _ownedData[_batchHead.scanForward(tokenId_)];
    assembly {
      owner := and(data, _BITMASK_LOWER160BITS)
    }
    if (owner == address(0)) {
      owner = _STASH_ADDRESS;
    }
  }

  /**
   * @dev See {IERC404-safeTransferFrom}.
   */
  function safeTransferFrom(address from_, address to_, uint256 tokenId_) public virtual override {
    safeTransferFrom(from_, to_, tokenId_, "");
  }

  /**
   * @dev See {IERC404-safeTransferFrom}.
   */
  function safeTransferFrom(address from_, address to_, uint256 tokenId_, bytes memory data_) public virtual override {
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    if (!_isApprovedOrOwner(msg.sender, tokenId_)) revert ERC721InsufficientApproval(msg.sender, tokenId_);
    _safeTransferERC721(from_, to_, tokenId_, data_);
  }

  /**
   * @dev Safely transfers `tokenId_` token from `from_` to `to_`, ensuring the recipient contract
   * implements the ERC721Receiver interface to prevent tokens from being forever locked.
   *
   * `data_` is additional data without a specified format, included in the call to `to_`.
   *
   * This internal function is equivalent to {safeTransferFrom}, and can be used to implement alternative
   * token transfer mechanisms, such as signature-based ones.
   *
   * Requirements:
   * - `to_` cannot be the zero nor stash address.
   * - `tokenId_` must exist and be owned by `from_`.
   * - If `to_` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}.
   *
   * Emits a {Transfer} event.
   *
   * @param from_ The address sending the token.
   * @param to_ The address receiving the token.
   * @param tokenId_ The ID of the token being transferred.
   * @param data_ Additional data sent during the token transfer.
   */
  function _safeTransferERC721(address from_, address to_, uint256 tokenId_, bytes memory data_) internal virtual {
    if (!_checkOnERC721Received(from_, to_, tokenId_, 1, data_))
      revert ERC721ReceiverNotImplemented(to_, tokenId_, 1, data_);
    if (to_ == address(0) || to_ == _STASH_ADDRESS || to_ == from_) revert ERC721InvalidReceiver(to_);
    _transferERC721(from_, to_, tokenId_);
  }

  /**
   * @dev Internal function to invoke {IERC721Receiver-onERC721Received} on a target address.
   * The call is not executed if the target address is not a contract.
   *
   * @param from_ Address representing the previous owner of the given token ID.
   * @param to_ Target address that will receive the tokens.
   * @param startTokenId_ The first ID of the tokens to be transferred.
   * @param quantity_ Amount of tokens to be transferred.
   * @param data_ Optional data to send along with the call.
   * @return r Boolean indicating whether the call returned the expected magic value.
   */
  function _checkOnERC721Received(address from_, address to_, uint256 startTokenId_, uint256 quantity_, bytes memory data_) private returns (bool r) {
    if (to_.code.length > 0) {
      r = true;
      for (uint256 tokenId = startTokenId_; tokenId < startTokenId_ + quantity_; tokenId++) {
        try IERC721Receiver(to_).onERC721Received(msg.sender, from_, tokenId, data_) returns (bytes4 retval) {
          r = r && retval == IERC721Receiver.onERC721Received.selector;
        } catch (bytes memory reason) {
          if (reason.length == 0) {
            revert ERC721ReceiverNotImplemented(to_, startTokenId_, quantity_, data_);
          } else {
            assembly {
              revert(add(32, reason), mload(reason))
            }
          }
        }
      }
      return r;
    } else {
      return true;
    }
  }

  /**
   * @dev Returns whether `spender` is allowed to manage `tokenId`.
   *
   * Requirements:
   * - `tokenId` must exist.
   *
   * @param spender_ The address being checked for approval.
   * @param tokenId_ The ID of the token being checked.
   * @return A boolean indicating whether `spender` is allowed to manage `tokenId`.
   */
  function _isApprovedOrOwner(address spender_, uint256 tokenId_) internal view virtual returns (bool) {
    address owner = ownerOf(tokenId_);
    return (spender_ == owner || getApproved(tokenId_) == spender_ || isApprovedForAll(owner, spender_));
  }

  /**
   * @dev Adds a batch of tokens to the `_owned` mapping for the given owner.
   *
   * @param batchInitialId_ The initial ID of the batch of tokens.
   * @param owner_ The address of the owner.
   * @param quantity_ The quantity of tokens in the batch.
   */
  function _pushOwned(uint256 batchInitialId_, address owner_, uint256 quantity_) internal virtual {
    uint256 data;
    assembly {
      data := add(and(batchInitialId_, _BITMASK_LOWER160BITS), and(shl(160, quantity_), _BITMASK_UPPER96BITS))
    }
    _owned[owner_].push(data);
  }

  /**
   * @dev Sets the data for a specific batch of tokens in the `_owned` mapping for the given owner and index.
   *
   * @param batchInitialId_ The initial ID of the batch of tokens.
   * @param owner_ The address of the owner.
   * @param index_ The index of the batch in the `_owned` array.
   * @param quantity_ The quantity of tokens in the batch.
   */
  function _setOwned(uint256 batchInitialId_, address owner_, uint256 index_, uint256 quantity_) internal virtual {
    uint256 data;
    assembly {
      data := add(and(batchInitialId_, _BITMASK_LOWER160BITS), and(shl(160, quantity_), _BITMASK_UPPER96BITS))
    }
    _owned[owner_][index_] = data;
  }

  /**
   * @dev Retrieves the initial ID and quantity of tokens in a batch owned by a specific address.
   *
   * @param owner_ The address of the token owner.
   * @param index_ The index of the batch in the owner's collection.
   * @return batchInitialId The initial ID of the tokens in the batch.
   * @return batchQuantity The quantity of tokens in the batch.
   */
  function _getOwnedBatchInitialIdAndQuantity(address owner_, uint256 index_) internal view virtual returns (uint256 batchInitialId, uint256 batchQuantity) {
    uint256 data = _owned[owner_][index_];
    assembly {
      batchInitialId := and(data, _BITMASK_LOWER160BITS)
      batchQuantity := shr(160, data)
    }
  }

  /**
   * @dev Sets the data for a batch of owned tokens at a specific index in the _ownedData mapping.
   * This function is used to update the data associated with a batch of tokens owned by an address.
   * It ensures that the index does not exceed the upper limit defined by _BITMASK_UPPER96BITS >> 160.
   *
   * @param batchInitialId_ The initial ID of the tokens in the batch.
   * @param ownerOf_ The address of the owner of the tokens in the batch.
   * @param index_ The index of the batch within the _owned[ownerOf_] mapping.
   */
  function _setOwnedData(uint256 batchInitialId_, address ownerOf_, uint256 index_) internal virtual {
    if (index_ > _BITMASK_UPPER96BITS >> 160) {
      revert ERC404OwnedIndexOverflow(index_);
    }
    uint256 data;
    assembly {
      data := add(and(ownerOf_, _BITMASK_LOWER160BITS), and(shl(160, index_), _BITMASK_UPPER96BITS))
    }
    _ownedData[batchInitialId_] = data;
  }

  /**
   * @dev Retrieves the owner, index within the owner's batch, and token ID at the head of the batch for the given token ID.
   *
   * Requirements:
   * - The token ID must exist.
   *
   * @param tokenId_ The ID of the token for which to retrieve information.
   * @return owner The address of the token's owner.
   * @return index The index of the token within the owner's batch.
   * @return tokenIdBatchHead The token ID at the head of the batch.
   */
  function _getOwnerOwnedIndexAndBatchHeadId(uint256 tokenId_) internal view returns (address owner, uint256 index, uint256 tokenIdBatchHead) {
    tokenIdBatchHead = _batchHead.scanForward(tokenId_);
    uint256 data = _ownedData[tokenIdBatchHead];
    assembly {
      index := shr(160, data)
      owner := and(data, _BITMASK_LOWER160BITS)
    }
  }

  /**
   * @dev Transfers an ERC721 token from one address to another.
   *
   * Requirements:
   * - `from_` must be the owner of the token.
   * - Token ID must exist and be owned by `from_`.
   * - If `to_` is a smart contract, it must implement {IERC721Receiver-onERC721Received}.
   * - If `to_` is exempt from ERC721 transfer, the token is moved to the stash.
   *
   * Emits an {IERC721-Transfer} event.
   * Emits an {IERC20-Transfer} event.
   *
   * @param from_ The address transferring the token.
   * @param to_ The address receiving the token.
   * @param tokenId_ The ID of the token being transferred.
   */
  function _transferERC721(address from_, address to_, uint256 tokenId_) internal virtual {
    (address owner, uint256 index, uint256 tokenIdBatchHead) = _getOwnerOwnedIndexAndBatchHeadId(tokenId_);
    // _beforeTokenTransfers(from_, to_, tokenId_, 1);

    delete _tokenApprovals[tokenId_]; // On transfer, any previous approval is reset.

    uint256 batchQuantity;
    uint256 data = _owned[owner][index];
    assembly {
      batchQuantity := shr(160, data)
    }
    _removeTokenFrom(from_, index, tokenId_, tokenIdBatchHead, batchQuantity);

    if (_erc721TransferExempt[to_]) {
      // Is exempt: move to stash
      _batchHead.set(tokenId_);
      _stashQueue.pushFront(tokenId_);

      address mutableStashAddress = _STASH_ADDRESS;
      assembly {
        // Emit ERC721.Transfer(from_, _STASH_ADDRESS, tokenId_)
        log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(mutableStashAddress, _BITMASK_LOWER160BITS), tokenId_)
      }
    }
    else {
      // Add ownership to "to_"
      assembly {
        data := add(and(tokenId_, _BITMASK_LOWER160BITS), and(shl(160, 1), _BITMASK_UPPER96BITS))
      }
      _owned[to_].push(data);
      uint256 index_ = _owned[to_].length - 1;
      assembly {
        data := add(and(to_, _BITMASK_LOWER160BITS), and(shl(160, index_), _BITMASK_UPPER96BITS))
      }
      _ownedData[tokenId_] = data;

      assembly {
        // emit IERC721.Transfer(from_, to_, tokenId_);
        log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(to_, _BITMASK_LOWER160BITS), tokenId_)
      }
    }

    unchecked {
      // `_balances[from]` cannot overflow for the same reason as described in `_burn`:
      // `from`'s balance is the number of token held, which is at least one before the current
      // transfer.
      // `_balances[to]` could overflow in the conditions described in `_mint`. That would require
      // all 2**256 token ids to be minted, which in practice is impossible.
      _balances[from_] -= _UNIT;
      _balances[to_] += _UNIT;
    }

    data = _UNIT;
    assembly {
      // emit IERC20.Transfer(from_, to_, _UNIT);
      mstore(0x00, data)
      log3(0x00, 0x20, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(to_, _BITMASK_LOWER160BITS))
    }
    // _afterTokenTransfers(from_, to_, tokenId_, 1);
  }

  /**
   * @dev Removes a token from an address, adjusting the internal data structures accordingly.
   *
   * Requirements:
   * - `from_` must be the owner of the token.
   *
   * @param from_ The address from which the token is being removed.
   * @param index_ The index of the token within the owner's batch.
   * @param tokenId_ The ID of the token being removed.
   * @param batchInitialId_ The initial ID of the batch.
   * @param batchQuantity_ The quantity of tokens in the batch.
   */
  function _removeTokenFrom(address from_, uint256 index_, uint256 tokenId_, uint256 batchInitialId_, uint256 batchQuantity_) internal {
    unchecked {
      // If Is Batch Head == No tokens before in the batch.
      if (batchInitialId_ == tokenId_) {
        if (batchQuantity_ == 1) {
          _removeSingleToken(from_, index_);
        } else {
          _removeBatchHeadToken(from_, index_, tokenId_, batchQuantity_);
        }
      } else {
        // Is not batch head == There is tokens before for the
        _removeNonHeadToken(from_, index_, tokenId_, batchInitialId_, batchQuantity_);
      }
    }
  }

  /**
   * @dev Removes a single token from the owner's collection.
   * 
   * This internal function is used during ERC721 token transfers to remove a single token from the owner's collection.
   * It shifts the token data in the owner's collection to fill the gap left by the removed token, ensuring continuous indexing.
   * If the removed token is not the last token in the collection, it updates the metadata and batch information accordingly.
   *
   * @param from_ The address of the owner from which the token is being removed.
   * @param index_ The index of the token in the owner's collection to be removed.
   */
  function _removeSingleToken(address from_, uint256 index_) internal {
    unchecked {
      uint256[] storage ownedFrom = _owned[from_];
      uint256 fromStackLastIndex = ownedFrom.length - 1;
      if (fromStackLastIndex != index_) {
        uint256 data = ownedFrom[fromStackLastIndex];
        ownedFrom[index_] = data;
        uint256 lastBatchInitialId;
        assembly {
          lastBatchInitialId := and(data, _BITMASK_LOWER160BITS)
          data := add(and(from_, _BITMASK_LOWER160BITS), and(shl(160, index_), _BITMASK_UPPER96BITS))
        }
        _ownedData[lastBatchInitialId] = data;
      }
      ownedFrom.pop();
    }
  }

  /**
   * @dev Removes the batch head token from the owner's collection.
   * 
   * This internal function is used during ERC721 token transfers to remove the batch head token from the owner's collection.
   * It sets the subsequent token ID as the new batch head, updates the batch information, and shifts the remaining tokens accordingly.
   *
   * @param from_ The address of the owner from which the batch head token is being removed.
   * @param index_ The index of the batch head token in the owner's collection to be removed.
   * @param tokenId_ The ID of the batch head token being removed.
   * @param batchQuantity_ The quantity of tokens in the batch (including the batch head).
   */
  function _removeBatchHeadToken(address from_, uint256 index_, uint256 tokenId_, uint256 batchQuantity_) internal {
    unchecked {
      uint256 subsequentTokenId = tokenId_ + 1;
      _batchHead.set(subsequentTokenId);

      uint256 data;
      assembly {
        data := add(and(from_, _BITMASK_LOWER160BITS), and(shl(160, index_), _BITMASK_UPPER96BITS))
      }
      _ownedData[subsequentTokenId] = data;

      assembly {
        data := add(
          and(subsequentTokenId, _BITMASK_LOWER160BITS),
          and(shl(160, sub(batchQuantity_, 1)), _BITMASK_UPPER96BITS)
        )
      }
      _owned[from_][index_] = data;
    }
  }

  /**
   * @dev Removes a non-head token from the owner's collection within a batch.
   * 
   * This internal function is used during ERC721 token transfers to remove a token that is not the batch head from the owner's collection within a batch.
   * It updates the batch information, shifts the remaining tokens accordingly, and creates a new batch if necessary.
   *
   * @param from_ The address of the owner from which the token is being removed.
   * @param index_ The index of the token in the owner's collection to be removed.
   * @param tokenId_ The ID of the token being removed.
   * @param batchInitialId_ The ID of the first token in the batch.
   * @param batchQuantity_ The quantity of tokens in the batch.
   */
  function _removeNonHeadToken(address from_, uint256 index_, uint256 tokenId_, uint256 batchInitialId_, uint256 batchQuantity_) internal {
    unchecked {
      _batchHead.set(tokenId_);
      uint256 batchSizeAndIndex = tokenId_ - batchInitialId_;
      uint256 data;
      assembly {
        data := add(and(batchInitialId_, _BITMASK_LOWER160BITS), and(shl(160, batchSizeAndIndex), _BITMASK_UPPER96BITS))
      }
      _owned[from_][index_] = data;

      if (batchSizeAndIndex < batchQuantity_ - 1) {
        // It means that the batch continues
        uint256 subsequentTokenId = tokenId_ + 1;
        _batchHead.set(subsequentTokenId);

        batchSizeAndIndex = (batchQuantity_ - 1) - (tokenId_ - batchInitialId_);
        assembly {
          data := add(and(subsequentTokenId, _BITMASK_LOWER160BITS), and(shl(160, batchSizeAndIndex), _BITMASK_UPPER96BITS))
        }
        _owned[from_].push(data);

        batchSizeAndIndex = _owned[from_].length - 1;
        assembly {
          data := add(and(from_, _BITMASK_LOWER160BITS), and(shl(160, batchSizeAndIndex), _BITMASK_UPPER96BITS))
        }
        _ownedData[subsequentTokenId] = data;
      }
    }
  }

  /**
   * @dev See {IERC404-getApproved}.
   */
  function getApproved(uint256 tokenId_) public view virtual override returns (address) {
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    return _tokenApprovals[tokenId_];
  }

  /**
   * @dev See {IERC404-setApprovalForAll}.
   */
  function setApprovalForAll(address operator_, bool approved_) public virtual override {
    address owner = msg.sender;
    if(operator_ == owner) revert ERC721InvalidOperator(operator_);
    _operatorApprovals[owner][operator_] = approved_;
    assembly {
      // emit IERC721.ApprovalForAll(owner, operator, approved);
      mstore(0x00, approved_)
      log3(0x00, 0x20, _APPROVALFORALL_EVENT_SIGNATURE, and(owner, _BITMASK_LOWER160BITS), and(operator_, _BITMASK_LOWER160BITS))
    }
  }

  /**
   * @dev See {IERC404-isApprovedForAll}.
   */
  function isApprovedForAll(address owner_, address operator_) public view virtual override returns (bool) {
    return _operatorApprovals[owner_][operator_];
  }

  /**
   * @dev Safely mints a specified quantity of ERC721 tokens and assigns them to the specified address.
   *
   * This internal function is equivalent to calling `_safeMint(to, quantity, "")`, providing an empty data parameter.
   * It ensures that the minted tokens are safely transferred to the recipient by calling the ERC721 safe transfer function.
   *
   * @param to_ The address to which the minted tokens will be assigned.
   * @param quantity_ The number of tokens to mint.
   */
  function _safeMint(address to_, uint256 quantity_) internal virtual {
    _safeMint(to_, quantity_, "");
  }

  /**
   * @dev Safely mints a specified quantity of ERC721 tokens and assigns them to the specified address.
   *
   * This internal function is equivalent to calling `_mint(to_, quantity_)` followed by a check to ensure that the recipient contract implements ERC721Receiver.
   * It requires the recipient contract to implement the ERC721Receiver interface's `onERC721Received` function to receive the tokens safely.
   *
   * @param to_ The address to which the minted tokens will be assigned.
   * @param quantity_ The number of tokens to mint.
   * @param data_ Additional data sent along with the token transfer, if any.
   */
  function _safeMint(address to_, uint256 quantity_, bytes memory data_) internal virtual {
    if (!_checkOnERC721Received(address(0), to_, _nextTokenId, quantity_, data_)) {
      revert ERC721ReceiverNotImplemented(to_, _nextTokenId, quantity_, data_);
    }
    _mint(to_, quantity_);
  }


  /**
   * @dev Mints a specified quantity of ERC721 tokens and assigns them to the specified address.
   *
   * This internal function performs the minting of ERC721 tokens and updates the balances accordingly. 
   * It also emits one ERC20 Transfer event and a ERC721 Transfer event for each minted token.
   * If the recipient address is exempt from ERC721 transfer fees, the method sets the batch head accordingly; 
   * otherwise, it adds the minted tokens to the recipient's ownership.
   *
   * Requirements:
   * - `quantity_` must be greater than 0.
   * - `to_` address must not be the zero nor stash address.
   *
   * Emits an IERC20 {Transfer} event.
   * Emits an IERC721 {Transfer} event for each minted token.
   *
   * @param to_ The address to which the minted tokens will be assigned.
   * @param quantity_ The number of tokens to mint.
   */
  function _mint(address to_, uint256 quantity_) internal virtual {
    if (quantity_ == 0) revert ERC721InvalidMintQuantity();
    if (to_ == address(0) || to_ == _STASH_ADDRESS) revert ERC20InvalidReceiver(to_);
    // _beforeTokenTransfers(address(0), to_, _nextTokenId, quantity_);

    uint256 value;
    uint256 toMasked;
    uint256 end;
    uint256 batchTokenId = _nextTokenId;
    unchecked {
      value = quantity_ * _UNIT;
      _balances[to_] += value; // May overflow in big quantities if total balance not controlled. 
      end = batchTokenId + quantity_;
    }

    assembly {
      // emit IERC20.Transfer(0x00, to_, _UNIT);
      toMasked := and(to_, _BITMASK_LOWER160BITS)
      mstore(0x00, value)
      log3(0x00, 0x20, _TRANSFER_EVENT_SIGNATURE, 0x00, toMasked)
    }

    if (_erc721TransferExempt[to_]) {
      _batchHead.setBatch(batchTokenId, quantity_);
    } else {
      _batchHead.set(batchTokenId);
      _pushOwned(batchTokenId, to_, quantity_);
      _setOwnedData(batchTokenId, to_, _owned[to_].length - 1);

      // Use assembly to loop and emit the `Transfer` event for gas savings.
      // The duplicated `log4` removes an extra check and reduces stack juggling.
      assembly {
        // emit IERC721.Transfer(0x00, to_, batchTokenId);
        log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, 0x00, toMasked, batchTokenId)

        // The `iszero(eq(,))` check ensures that large values of `quantity`
        // that overflows uint256 will make the loop run out of gas.
        // The compiler will optimize the `iszero` away for performance.
        for {
          let tokenId := add(batchTokenId, 1)
        } iszero(eq(tokenId, end)) {
          tokenId := add(tokenId, 1)
        } {
          // emit IERC721.Transfer(0x00, to_, tokenId);
          log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, 0x00, toMasked, tokenId)
        }
      }
    }

    // _afterTokenTransfers(address(0), to_, _nextTokenId, quantity_);
    unchecked {
      _nextTokenId += quantity_;
    }
  }

  /// ERC20 Methods ///

  /**
   * @dev See {IERC404-totalSupply}.
   */
  function totalSupply() public view virtual override returns (uint256) {
    return _totalTokens() * _UNIT;
  }

  /**
   * @dev Calculates the total number of tokens that have been minted and not burned.
   *
   * This internal function returns the difference between the total minted tokens and the burned tokens, representing the total number of existing tokens in circulation.
   *
   * @return The total number of existing tokens in circulation.
   */
  function _totalTokens() internal view virtual returns (uint256) {
    return _totalMinted() - _burned();
  }

  /**
   * @dev Retrieves the total number of tokens that have been burned.
   *
   * This internal function returns the count of tokens that have been burned within the contract.
   *
   * @return The total number of tokens that have been burned.
   */
  function _burned() internal view virtual returns (uint256) {
    return _burnedCount;
  }

  /**
   * @dev See {IERC404-transfer}.
   */
  function transfer(address to_, uint256 valueOrId_) public virtual override returns (bool) {
    address owner = msg.sender;
    transferFrom(owner, to_, valueOrId_); 
    return true;
  }

  /**
   * @dev See {IERC404-allowance}.
   */
  function allowance(address owner_, address spender_) public view virtual override returns (uint256) {
    return _allowances[owner_][spender_];
  }

  /// ERC404 Combined (Methods with similar interfaces and behavior in ERC20 & ERC721) ///

  /**
   * @dev See {IERC404-balanceOf}.
   */
  function balanceOf(address account_) public view virtual override returns (uint256) {
    return _balances[account_];
  }

  /**
   * @dev See {IERC404-transferFrom}.
   */
  function transferFrom(address from_, address to_, uint256 valueOrId_) public virtual returns (bool) {
    if (_exists(valueOrId_)) {
      safeTransferFrom(from_, to_, valueOrId_, "");
    } else {
      return _transferFromERC20(from_, to_, valueOrId_);
    }
    return true;
  }

  /**
   * @dev Transfers ERC20 tokens from one address to another, handling ERC721 exemptions internally.
   *
   * This function is used to transfer ERC20 tokens directly between addresses, handling exemptions for ERC721 transfers
   * internally. It checks for valid recipients, allowances, and handles ERC721 exemptions if the recipient address is
   * exempt from ERC721 transfers.
   *
   * Requirements:
   * - `to_` cannot be the zero address or the stash address.
   *
   * @param from_ The address sending the ERC20 tokens.
   * @param to_ The address receiving the ERC20 tokens.
   * @param value_ The amount of ERC20 tokens to transfer.
   * @return A boolean indicating whether the transfer was successful.
   */
  function _transferFromERC20(address from_, address to_, uint256 value_) public virtual returns (bool) {
    if (to_ == address(0) || to_ == _STASH_ADDRESS || to_ == from_) revert ERC20InvalidReceiver(to_);

    if (from_ != msg.sender) {
      uint256 allowed = _allowances[from_][msg.sender];

      // Check that the operator has sufficient allowance.
      if (allowed != type(uint256).max) {
        if(value_ > allowed) revert ERC20InsufficientAllowance(from_, allowed, value_);
        _allowances[from_][msg.sender] = allowed - value_;
      }
    }

    // Transferring ERC-20s directly requires the _transferERC20WithERC721 function.
    return _transferERC20WithERC721(from_, to_, value_);
  }

  /**
   * @dev This function handles the transfer of ERC-20 tokens and optionally adjusts the ERC-721 token balances based on the transfer exemptions.
   * 
   * Requirements:
   * - The sender (`from_`) must have a balance of at least `value_`.
   * 
   * Emits:
   * - {IERC20.Transfer} event for ERC-20 and possibly a {IERC721.Transfer} for each ERC-721 Token.
   * 
   * @param from_ Address sending the tokens.
   * @param to_ Address receiving the tokens.
   * @param value_ Amount of ERC-20 tokens to transfer.
   * @return bool True if the transfer is successful.
   */
  function _transferERC20WithERC721(address from_, address to_, uint256 value_) internal virtual returns (bool) {
    uint256 erc20BalanceOfSenderBefore = _balances[from_];
    uint256 erc20BalanceOfReceiverBefore = _balances[to_];

    if (erc20BalanceOfSenderBefore < value_) revert ERC20InsufficientBalance(from_, erc20BalanceOfSenderBefore, value_);

    unchecked {
      _balances[from_] -= value_;
      _balances[to_] += value_;
    }

    assembly {
      // emit IERC20.Transfer(from_, to_, value_);
      mstore(0x00, value_)
      log3(0x00, 0x20, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(to_, _BITMASK_LOWER160BITS))
    }

    // Skip ERC-721 transfer to exempt addresses to save gas
    bool isFromERC721TransferExempt = _erc721TransferExempt[from_];
    bool isToERC721TransferExempt = _erc721TransferExempt[to_];
    if (isFromERC721TransferExempt && isToERC721TransferExempt) {
      // Case 1) Both sender and recipient are ERC-721 transfer exempt. No ERC-721s need to be transferred.
    } else if (isFromERC721TransferExempt) {
      // Case 2) The sender is ERC-721 transfer exempt, but the recipient is not. 
      unchecked {
        uint256 tokensToRetrieveFromStash = (_balances[to_] / _UNIT) - (erc20BalanceOfReceiverBefore / _UNIT);
        _retrieveFromStash(to_, tokensToRetrieveFromStash);
      }
    } else if (isToERC721TransferExempt) {
      // Case 3) The sender is not ERC-721 transfer exempt, but the recipient is. 
      unchecked {
        uint256 tokensToStash = (erc20BalanceOfSenderBefore / _UNIT) - (_balances[from_] / _UNIT);
        _stash(from_, tokensToStash);
      }
    } else {
      // Case 4) Neither the sender nor the recipient are ERC-721 transfer exempt.
      _batchTransferERC721WithBalanceAdjustment(from_, to_, erc20BalanceOfSenderBefore, erc20BalanceOfReceiverBefore, value_);
    }
    return true;
  }

  /**
   * @dev Internal function to batch transfer ERC721 tokens with balance adjustment.
   * 
   * Emits a {IERC721.Transfer} event for each token transferred, including the initial token ID and all subsequent IDs in the batch.
   *
   * @param from_ The address from which to transfer tokens.
   * @param to_ The address to which to transfer tokens.
   * @param fromPreviousBalance_ The previous balance of tokens for the sender.
   * @param toPreviousBalance_ The previous balance of tokens for the recipient.
   * @param transferedValue_ The value of tokens to be transferred.
   */
  function _batchTransferERC721WithBalanceAdjustment(address from_, address to_, uint256 fromPreviousBalance_, uint256 toPreviousBalance_, uint256 transferedValue_) internal {
    uint256 tokenId;
    uint256 end;
    uint256 nftsToTransfer = transferedValue_ / _UNIT;
    for (uint256 i = 0; i < nftsToTransfer; ) {
      // Transfers the whole batch
      uint256 lastOwnedIndex = _owned[from_].length - 1;
      (uint256 batchInitialId_, uint256 batchQuantity_) = _getOwnedBatchInitialIdAndQuantity(from_, lastOwnedIndex);

      if (batchQuantity_ + i <= nftsToTransfer) {
        // Transfer whole batch
        _owned[to_].push(_owned[from_][lastOwnedIndex]);
        _owned[from_].pop();

        uint256 lastToIndex = _owned[to_].length - 1;
        _setOwnedData(batchInitialId_, to_, lastToIndex);

        unchecked {
          tokenId = batchInitialId_;
          end = batchInitialId_ + batchQuantity_;
          i += batchQuantity_;
        }
      } else {
        // Transfers part of the batch
        unchecked {
          uint256 tokensToTransfer = nftsToTransfer - i;
          uint256 tokensInPreviousBatch = batchQuantity_ - tokensToTransfer;
          _setOwned(batchInitialId_, from_, lastOwnedIndex, tokensInPreviousBatch);

          uint256 newBatchInitialId = batchInitialId_ + tokensInPreviousBatch;
          _batchHead.set(newBatchInitialId);
          _pushOwned(newBatchInitialId, to_, tokensToTransfer);
          _setOwnedData(newBatchInitialId, to_, _owned[to_].length - 1);

          tokenId = newBatchInitialId;
          end = newBatchInitialId + tokensToTransfer;
          i = nftsToTransfer;
        }
      }
      unchecked {
        for (uint256 j = tokenId; j < end; ++j) {
          delete _tokenApprovals[j]; // On transfer, any previous approval is reset.

          assembly {
            // emit IERC721.Transfer(from_, to_, emitInitialId);
            log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(to_, _BITMASK_LOWER160BITS), j)
          }
        }
      }
    }

    // If the transfer changes either the sender or the recipient's holdings from a fractional to a non-fractional
    // amount (or vice versa), adjust ERC-721s.
    unchecked {
      // First check if the send causes the sender to lose a whole token that was represented by an ERC-721
      // due to a fractional part being transferred.
      if (fromPreviousBalance_ / _UNIT - _balances[from_] / _UNIT > nftsToTransfer) {
        _stash(from_, 1);
      }

      // Then, check if the transfer causes the receiver to gain a whole new token which requires gaining
      // an additional ERC-721.
      if (_balances[to_] / _UNIT - toPreviousBalance_ / _UNIT > nftsToTransfer) {
        _retrieveFromStash(to_);
      }
    }
  }

  /**
   * @dev Internal virtual function to stash ERC721 tokens.
   * 
   * Emits a {IERC721.Transfer} event for each token stashed.
   *
   * @param from_ The address from which to stash tokens.
   * @param quantity_ The quantity of tokens to be stashed.
   */
  function _stash(address from_, uint256 quantity_) internal virtual {
    unchecked {
      uint256 batchInitialId_;
      uint256 batchQuantity_;
      uint256 data;
      // Stash loop variables
      uint256 begin;
      uint256 end;

      for (uint256 stashed = 0; stashed < quantity_; ) {
        data = _owned[from_][_owned[from_].length - 1];
        assembly {
          batchInitialId_ := and(data, _BITMASK_LOWER160BITS)
          batchQuantity_ := shr(160, data)
        }
        if (stashed + batchQuantity_ <= quantity_) {
          // Transfer the whole batch
          delete _ownedData[batchInitialId_];
          _batchHead.setBatch(batchInitialId_, batchQuantity_); // Set batchead in a massive way to all tokens.
          _owned[from_].pop(); // Remove batch from owned ids
          stashed += batchQuantity_; // Increment the stashed items
          begin = batchInitialId_; 
          end = begin + batchQuantity_;
        } else {
          // Only transfer the amount needed, maintain the batch
          uint256 tokensToStash = quantity_ - stashed;
          uint256 nonStashedBatchSize = batchQuantity_ - tokensToStash;
          begin = batchInitialId_ + nonStashedBatchSize;
          end = begin + tokensToStash;
          _batchHead.setBatch(begin, tokensToStash); // Set batchead in a massive way to all tokens to be stashed
          _setOwned(batchInitialId_, from_, _owned[from_].length - 1, nonStashedBatchSize); // Update the batch size
          stashed = quantity_; // Update the stashed items
        }
        address mutableStashAddress = _STASH_ADDRESS;
        for (uint256 i=begin; i<end; ++i) {
          _stashQueue.pushFront(i);
          delete _tokenApprovals[i]; // On stash of a token, any previous approval is reset.
          assembly {
            // emit IERC721.Transfer(from_, _STASH_ADDRESS, tokenId);
            log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(from_, _BITMASK_LOWER160BITS), and(mutableStashAddress, _BITMASK_LOWER160BITS), i)
          }
        }
      }
    }
  }

  /**
   * @dev Internal virtual function to retrieve ERC721 tokens from the stash.
   * 
   * Emits a {IERC721.Transfer} event for each token retrieved.
   *
   * @param to_ The address to which retrieved tokens will be transferred.
   */
  function _retrieveFromStash(address to_) internal virtual {
    uint256 id = _stashQueue.popBack();
    _pushOwned(id, to_, 1);
    unchecked {
      _setOwnedData(id, to_, _owned[to_].length - 1);
    }

    address mutableStashAddress = _STASH_ADDRESS;
    assembly {
      // emit IERC721.Transfer(_STASH_ADDRESS, to_, tokenId);
      log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(mutableStashAddress, _BITMASK_LOWER160BITS), and(to_, _BITMASK_LOWER160BITS), id)
    }
  }

  /**
   * @dev Internal function to retrieve multiple ERC721 tokens from the stash and transfer them to a recipient.
   * 
   * Emits a {IERC721.Transfer} event for each token retrieved, including the token ID transferred to the recipient.
   * 
   * @param to_ The address to which retrieved tokens will be transferred.
   * @param amount_ The number of tokens to retrieve from the stash.
   */
  function _retrieveFromStash(address to_, uint256 amount_) internal {
    for (uint256 i = 0; i < amount_; ) {
      _retrieveFromStash(to_);
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @dev See {IERC404-approve}.
   */
  function approve(address spender_, uint256 valueOrId_) public virtual returns (bool) {
    if (_exists(valueOrId_)) {
      _erc721Approve(spender_, valueOrId_);
    } else {
      return _erc20Approve(spender_, valueOrId_);
    }
    return true;
  }

  /**
   * @dev Approves a specific address to transfer the specified ERC-721 token.
   * 
   * Requirements:
   * - The caller must be the owner of the ERC-721 token or have been approved by the owner.
   * 
   * Emits:
   * - {IERC721.Approval} event for ERC-721 Tokens.
   * 
   * @param spender_ Address to be approved for the specified ERC-721 token.
   * @param id_ ID of the ERC-721 token to be approved.
   */
  function _erc721Approve(address spender_, uint256 id_) public virtual {
    address erc721Owner = ownerOf(id_);
    if (msg.sender != erc721Owner && !isApprovedForAll(erc721Owner, msg.sender)) {
      revert ERC721InvalidApprover(msg.sender);
    }
    _tokenApprovals[id_] = spender_;

    assembly {
      // emit IERC721.Approval(erc721Owner, spender_, id_);
      log4(0x00, 0x00, _APPROVAL_EVENT_SIGNATURE, and(erc721Owner, _BITMASK_LOWER160BITS), and(spender_, _BITMASK_LOWER160BITS), id_)
    }
  }

  /**
   * @dev Approves a specific address to spend a specified amount of ERC-20 tokens on behalf of the caller.
   * 
   * Requirements:
   * - The spender address must not be the zero address.
   * 
   * Emits:
   * - {IERC20.Approval} event for ERC-20 Tokens.
   * 
   * @param spender_ Address to be approved for spending the specified ERC-20 tokens.
   * @param value_ Amount of ERC-20 tokens to be approved for spending.
   * @return bool True if the approval is successful.
   */
  function _erc20Approve(address spender_, uint256 value_) public virtual returns (bool) {
    address owner = msg.sender;
    if (spender_ == address(0) || spender_ == _STASH_ADDRESS) {
      revert ERC20InvalidSpender(spender_);
    }
    _allowances[owner][spender_] = value_;

    assembly {
      // emit IERC20.Approval(msg.sender, spender_, value_);
      let ownerMasked := and(owner, _BITMASK_LOWER160BITS)
      let approvedMasked := and(spender_, _BITMASK_LOWER160BITS)
      mstore(0x00, value_)
      log3(0x00, 0x20, _APPROVAL_EVENT_SIGNATURE, ownerMasked, approvedMasked)
    }
    return true;
  }

  /**
   * @dev See {IERC20Permit-permit}. 
   */
  function permit(address owner_, address spender_, uint256 value_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) public virtual {
    if (deadline_ < block.timestamp) {
      revert EIP2612PermitDeadlineExpired(owner_, spender_, value_, deadline_, v_, r_, s_);
    }

    // permit cannot be used for ERC-721 token approvals, so ensure
    // the value does not fall within the valid range of ERC-721 token ids.
    if (_exists(value_)) {
      revert ERC404InvalidTransferValue(value_);
    }

    if (spender_ == address(0) || spender_ == _STASH_ADDRESS) {
      revert ERC20InvalidSpender(spender_);
    }

    unchecked {
      address recoveredAddress = ecrecover(
        keccak256(
          abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR(),
            keccak256(
              abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner_,
                spender_,
                value_,
                nonces[owner_]++,
                deadline_
              )
            )
          )
        ),
        v_,
        r_,
        s_
      );

      if (recoveredAddress == address(0) || recoveredAddress != owner_) {
        revert EIP2612InvalidSigner(recoveredAddress, owner_, spender_, value_, deadline_, v_, r_, s_);
      }

      _allowances[recoveredAddress][spender_] = value_;
    }

    assembly {
      // emit IERC20.Approval(owner_, spender_, value_);
      let ownerMasked := and(owner_, _BITMASK_LOWER160BITS)
      let approvedMasked := and(spender_, _BITMASK_LOWER160BITS)
      mstore(0x00, value_)
      log3(0x00, 0x20, _APPROVAL_EVENT_SIGNATURE, ownerMasked, approvedMasked)
    }
  }

  /**
   * @dev See {IERC20Permit-DOMAIN_SEPARATOR}. 
   */
  function DOMAIN_SEPARATOR() public view virtual returns (bytes32) {
    return block.chainid == _INITIAL_CHAIN_ID ? _INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator();
  }

  /**
   * @notice Internal function to compute the domain separator for EIP-2612 permits.
   * @dev This function computes the domain separator based on the contract's name, version, chain ID, and address.
   * 
   * @return bytes32 The computed domain separator value.
   */
  function _computeDomainSeparator() internal view virtual returns (bytes32) {
    return
      keccak256(
        abi.encode(
          keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
          keccak256(bytes(_name)),
          keccak256("1"),
          block.chainid,
          address(this)
        )
      );
  }

  /**
   * @dev See {IERC404-isERC721TransferExempt}. 
   */
  function isERC721TransferExempt(address target_) external view override returns (bool isExempt) {
    isExempt = _erc721TransferExempt[target_];
  }

  /**
   * @dev See {IERC404-setERC721TransferExempt}. 
   */
  function setERC721TransferExempt(bool state_) external override {
    _setERC721TransferExempt(msg.sender, state_);
  }

  /**
   * @dev Internal function to set the exemption status for ERC-721 transfers.
   * 
   * Requirements:
   * - `target_` address cannot be the zero address or the stash address.
   * 
   * @param target_ The address for which to set the exemption status.
   * @param state_ The new exemption state to set (true for exempt, false for non-exempt).
   */
  function _setERC721TransferExempt(address target_, bool state_) internal virtual {
    if (target_ == address(0) || target_ == _STASH_ADDRESS) {
      revert ERC404InvalidERC721Exemption(target_);
    }

    // Adjust the ERC721 balances of the target to respect exemption rules.
    if (state_) {
      _stashAll(target_);
    } else {
      _retrieveAllFromStash(target_);
    }

    _erc721TransferExempt[target_] = state_;
  }

  /**
   * @dev Internal function to stash all ERC-721 tokens owned by the target address.
   * 
   * Emits:
   * - {IERC721.Transfer} event for ERC-721 tokens being transferred to the stash.
   * 
   * @param target_ The address whose tokens are to be stashed.
   */
  function _stashAll(address target_) private {
    uint256[] memory ownedTarget = _owned[target_];
    for (uint256 i = 0; i < ownedTarget.length; ) {
      (uint256 batchInitialId_, uint256 batchQuantity_) = _getOwnedBatchInitialIdAndQuantity(target_, i);
      delete _ownedData[batchInitialId_]; // Resets _ownedData
      _batchHead.setBatch(batchInitialId_, batchQuantity_); // Set batchead in a massive way to all tokens.

      // add all tokens to the stash
      unchecked {
        uint256 end = batchInitialId_ + batchQuantity_;
        address mutableStashAddress = _STASH_ADDRESS;

        for (uint256 b = batchInitialId_; b < end; ++b) {
          delete _tokenApprovals[b]; // On stash of a token, any previous approval is reset.
          _stashQueue.pushFront(b);
          assembly {
            // emit IERC721.Transfer(target_, _STASH_ADDRESS, batchInitialId_);
            log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, and(target_, _BITMASK_LOWER160BITS), and(mutableStashAddress, _BITMASK_LOWER160BITS), b)
          }
        }
        ++i;
      }
    }
    delete _owned[target_];
  }

  /**
   * @dev Internal function to retrieve all ERC-721 tokens from the stash for the target address.
   * 
   * Emits:
   * - {IERC721.Transfer} event for ERC-721 tokens being transferred from the stash.
   * 
   * @param target_ The address to retrieve ERC-721 tokens for.
   */
  function _retrieveAllFromStash(address target_) private {
    uint256 expectedERC721Balance = _balances[target_] / _UNIT;
    uint256 actualERC721Balance = 0;
    uint256[] memory ownedTarget = _owned[target_];
    for (uint256 i = 0; i < ownedTarget.length; ) {
      uint256 data = ownedTarget[i];
      assembly {
        actualERC721Balance := add(actualERC721Balance, shr(160, data))
        i := add(i, 1) // Avoiding an unchecked block after this one
      }
    }

    unchecked {
      expectedERC721Balance -= actualERC721Balance;
      for (uint256 i = 0; i < expectedERC721Balance; ++i) {
        // Transfer ERC721 balance in from pool
        _retrieveFromStash(target_);
      }
    }
  }

  /**
   * @dev See {IERC404-owned}. 
   */
  function owned(address owner_) public view virtual returns (uint256[] memory ownedCreatureIds) {
    if (owner_ == _STASH_ADDRESS) return tokensInStash();
    uint256 size = 0;
    uint256 data;
    uint256[] memory ownedOwner = _owned[owner_];
    for (uint256 i = 0; i < ownedOwner.length; ) {
      data = ownedOwner[i];
      assembly {
        size := add(size, shr(160, data))
        i := add(i, 1)
      }
    }
    ownedCreatureIds = new uint256[](size);

    unchecked {
      uint256 ix = 0;
      uint256 batchInitialId_;
      uint256 batchQuantity_;
      for (uint256 i = 0; i < ownedOwner.length; ++i) {
        data = ownedOwner[i];
        assembly {
          batchInitialId_ := and(data, _BITMASK_LOWER160BITS)
          batchQuantity_ := shr(160, data)
        }

        for (uint256 j = 0; j < batchQuantity_; ++j) {
          ownedCreatureIds[ix] = batchInitialId_ + j;
          ++ix;
        }
      }
    }
  }

  /**
   * @dev Internal function to burn (destroy) an ERC-721 token.
   * 
   * Emits:
   * - {IERC721.Transfer} event from `from` to `address(0)` (burning the token).
   * - {IERC20.Transfer} event from `from` to `address(0)` with `_UNIT` value (The ERC-20 side of the token).
   * 
   * @param tokenId_ ID of the ERC-721 token to be burned.
   */
  function _burn(uint256 tokenId_) internal virtual {
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    (address from, uint256 index, uint256 tokenIdBatchHead) = _getOwnerOwnedIndexAndBatchHeadId(tokenId_);
    // _beforeTokenTransfers(from, to, tokenId, 1);

    delete _tokenApprovals[tokenId_]; // On transfer, any previous approval is reset.

    uint256 batchQuantity_;
    uint256 data = _owned[from][index];
    assembly {
      batchQuantity_ := shr(160, data)
    }

    _removeTokenFrom(from, index, tokenId_, tokenIdBatchHead, batchQuantity_);
    delete _ownedData[tokenId_];
    _batchHead.set(tokenId_);
    _burnedTokens.set(tokenId_);

    unchecked {
      // Cannot overflow, as that would require more tokens to be burned/transferred
      // out than the owner initially received through minting and transferring in.
      _balances[from] -= _UNIT;
      ++_burnedCount;
    }

    data = _UNIT;
    assembly {
      let fromMasked := and(from, _BITMASK_LOWER160BITS)
      // emit IERC20.Transfer(from_, to_, _UNIT);
      mstore(0x00, data)
      log3(0x00, 0x20, _TRANSFER_EVENT_SIGNATURE, fromMasked, 0x00)

      // emit IERC721.Transfer(from, address(0), tokenId_);
      log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, fromMasked, 0x00, tokenId_)
    }
    // _afterTokenTransfers(from, address(0), tokenId, 1);
  }

  /**
   * @dev See {IERC404-stashAddress}. 
   */
  function stashAddress() public view returns (address) {
    return _STASH_ADDRESS;
  }

  /**
   * @dev See {IERC404-stashLength}. 
   */
  function stashLength() public view returns (uint256) {
    return _stashQueue.length();
  }

  /**
   * @dev See {IERC404-tokensInStash}. 
   */
  function tokensInStash() public view returns (uint256[] memory) {
    return _stashQueue.retriveQueueItems();
  }

  /**
   * @dev See {IERC404-exchangeWithStash}. 
   */
  function exchangeWithStash(uint256 tokenId_, uint128 index_) public {
    uint256 stashTokenId = _stashQueue.at(index_);
    if (!_exists(tokenId_)) revert ERC721NonexistentToken(tokenId_);
    if (!_isApprovedOrOwner(msg.sender, tokenId_)) revert ERC721InsufficientApproval(msg.sender, tokenId_);
    (address owner, uint256 index, uint256 tokenIdBatchHead) = _getOwnerOwnedIndexAndBatchHeadId(tokenId_);
    // _beforeTokenTransfers(msg.sender, _STASH_ADDRESS, tokenId_, 1);
    // _beforeTokenTransfers(_STASH_ADDRESS, msg.sender, stashTokenId, 1);

    delete _tokenApprovals[tokenId_]; // On transfer, any previous approval is reset.

    uint256 batchQuantity_;
    uint256 data = _owned[owner][index];
    assembly {
      batchQuantity_ := shr(160, data)
    }
    _removeTokenFrom(owner, index, tokenId_, tokenIdBatchHead, batchQuantity_);
    delete _ownedData[tokenId_];
    _batchHead.set(tokenId_);
    _stashQueue.setIndexValue(index_, tokenId_); // Sets the token to exchange into the stash

    // Now, sets the Stash token to the tokenId owner
    assembly {
      data := add(and(stashTokenId, _BITMASK_LOWER160BITS), and(shl(160, 1), _BITMASK_UPPER96BITS))
    }
    _owned[owner].push(data);
    unchecked {
      uint256 ownedIndex = _owned[owner].length - 1;
      assembly {
        data := add(and(owner, _BITMASK_LOWER160BITS), and(shl(160, ownedIndex), _BITMASK_UPPER96BITS))
      }
    }
    _ownedData[stashTokenId] = data;

    address stashMasked = _STASH_ADDRESS;
    assembly {
      stashMasked := and(stashMasked, _BITMASK_LOWER160BITS)
      let ownerMasked := and(owner, _BITMASK_LOWER160BITS)

      // emit IERC721.Transfer(_STASH_ADDRESS, owner, stashTokenId);
      log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, stashMasked, ownerMasked, stashTokenId)
      // emit IERC721.Transfer(owner, _STASH_ADDRESS, tokenId_);
      log4(0x00, 0x00, _TRANSFER_EVENT_SIGNATURE, ownerMasked, stashMasked, tokenId_)
    }
    // _afterTokenTransfers(msg.sender, _STASH_ADDRESS, tokenId_, 1);
    // _afterTokenTransfers(_STASH_ADDRESS, msg.sender, stashTokenId, 1);
  }
}
