// contracts/mocks/ERC721ReceiverMock.sol
// SPDX-License-Identifier: MIT

/**

   /3333333    /33333333    /333333 
  | 33__  33  | 33_____/   /33__  33
  | 33  \ 33  | 33        | 33  \__/
  | 3333333   | 33333     | 33      
  | 33__  33  | 33__/     | 33      
  | 33  \ 33  | 33        | 33    33
  | 3333333/  | 33333333  |  333333/
  |_______/   |________/   \______/ 

 # http://blackeyedcreatures.com

 */
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title ERC721Receiver Mock contract
 * @dev This contract can be used as an ERC721Receiver mock contract during tests.
 * @author https://42i.co
 */
contract ERC721ReceiverMock is IERC721Receiver {
    enum RevertType {
        None,
        RevertWithoutMessage,
        RevertWithMessage,
        RevertWithCustomError,
        Panic
    }

    bytes4 private immutable _retval;
    RevertType private immutable _error;

    event Received(address operator, address from, uint256 tokenId, bytes data, uint256 gas);
    error CustomError(bytes4);

    constructor(bytes4 retval, RevertType error) {
        _retval = retval;
        _error = error;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes memory data
    ) public returns (bytes4) {
        if (_error == RevertType.RevertWithoutMessage) {
            revert();
        } else if (_error == RevertType.RevertWithMessage) {
            revert("ERC721ReceiverMock: reverting");
        } else if (_error == RevertType.RevertWithCustomError) {
            revert CustomError(_retval);
        } else if (_error == RevertType.Panic) {
            uint256 a = uint256(0) / uint256(0);
            a;
        }

        emit Received(operator, from, tokenId, data, gasleft());
        return _retval;
    }
}