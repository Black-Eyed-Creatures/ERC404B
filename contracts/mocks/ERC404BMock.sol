// contracts/mocks/ERC404BMock.sol
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

import "../ERC404B.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC404B Mock contract
 * @dev This contract can be used as an ERC404B mock contract during tests.
 * @author https://42i.co
 */
contract ERC404BMock is ERC404B, Ownable {

  constructor() ERC404B("ERC404B Token", "B3", 1) Ownable(msg.sender) {}

   /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
    return super.supportsInterface(_interfaceId);
  }

  function setTransferExempt(address _exempt) public {
    _setERC721TransferExempt(_exempt, true);
  }

  function mint(address to, uint256 quantity) external onlyOwner {
    _mint(to, quantity);
  }

  function safeMint(address to, uint256 quantity) external onlyOwner {
    _safeMint(to, quantity);
  }

  function safeMint(address to, uint256 quantity, bytes memory _data) external onlyOwner {
    _safeMint(to, quantity, _data);
  }

  function getLastTokenId() external view returns (uint256) {
    return _nextTokenId;
  }

  function getTotalMinted() external view returns (uint256) {
    return _totalMinted();
  }

  function totalTokens() public view returns (uint256) {
    return _totalTokens();
  }

  function burn(uint256 _creatureId) public {
    _burn(_creatureId);
  }

  function burned() public view returns (uint256) {
    return _burned();
  }
}
