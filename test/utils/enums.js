const Enum = (...options) => Object.fromEntries(options.map((key, i) => [key, BigInt(i)]));

const StringEnum = (...options) => Object.fromEntries(options.map((key) => [key, String(key)]));

const ERC20Errors = StringEnum(
  "ERC20InsufficientBalance",
  "ERC20InvalidSender",
  "ERC20InvalidReceiver",
  "ERC20InsufficientAllowance",
  "ERC20InvalidApprover",
  "ERC20InvalidSpender"
);

const ERC721Errors = StringEnum(
  "ERC721InvalidOwner",
  "ERC721NonexistentToken",
  "ERC721IncorrectOwner",
  "ERC721InvalidSender",
  "ERC721InvalidReceiver",
  "ERC721InsufficientApproval",
  "ERC721InvalidApprover",
  "ERC721InvalidOperator"
);

const ERC404BErrors = StringEnum(
  "ERC404TokenNotInStash",
  "ERC404NotValidIndexValueInStash",
  "ERC404InvalidTransferValue",
  "ERC404InvalidERC721Exemption",
  "ERC404OwnedIndexOverflow",
  "ERC721InvalidMintQuantity",
  "ERC721ReceiverNotImplemented",
  "EIP2612PermitDeadlineExpired",
  "EIP2612InvalidSigner",
  "QueueOutOfBounds"
);

const RevertTypes = Enum("None", "RevertWithoutMessage", "RevertWithMessage", "RevertWithCustomError", "Panic");

module.exports = {
  Enum,
  StringEnum,
  ERC20Errors,
  ERC721Errors,
  ERC404BErrors,
  RevertTypes,
};
