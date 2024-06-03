const { ethers, artifacts } = require("hardhat");
const { StringEnum } = require("./enums");

const EventTypes = StringEnum(
  "Transfer",
  "Approval",
  "ApprovalForAll",
);
const eventsTopicsLengthExeptions = [EventTypes.ApprovalForAll];

const getSigntature = (event) => ethers.keccak256(ethers.toUtf8Bytes(event));
const EventsSignature = {
  [EventTypes.Transfer]: getSigntature("Transfer(address,address,uint256)"),
  [EventTypes.Approval]: getSigntature("Approval(address,address,uint256)"),
  [EventTypes.ApprovalForAll]: getSigntature("ApprovalForAll(address,address,bool)"),
};

/**
 * @function getLogs - Get the logs from a transaction
 * @param {*} tx - The transaction to get the logs from
 * @returns The logs from the transaction
 */
const getLogs = async (tx) => {
  const txHash = (await tx).hash;
  const logs = (await ethers.provider.getTransactionReceipt(txHash)).logs;
  return logs;
};

/**
 * @function parseEventsFromLogs
 * @param {string} contractType contract that emitted the event
 * @param {EventTypes} eventType type of event
 * @param {*} logs logs of the transaction
 * @param {Array<{ [key]: string, address: string }>} libraries libraries to link to the contract
 * @returns {Promise<Array<LogDescription>>} parsed events
 *
 * @requires EventsSignature to have the signature of the event
 * @requires eventsTopicsLengthExeptions to have the events applies to the exception
 */
const parseEventsFromLogs = async (contractType, eventType, logs, libraries = []) => {
  const signature = EventsSignature[eventType];

  let topicsConditional = (_) => true;
  let contract;

  if (contractType === "ERC721" || contractType === "ERC20") {
    const isErc20 = contractType === "ERC20";
    const topicsLength = isErc20 || eventsTopicsLengthExeptions.includes(eventType) ? 3 : 4;
    topicsConditional = (topics) => topics.length === topicsLength;

    const artifact = await artifacts.readArtifact(isErc20 ? "IERC20" : "IERC721");
    contract = await ethers.getContractFactory(artifact.abi, artifact.bytecode);
  } else {
    const artifact = await artifacts.readArtifact(contractType);
    contract = await ethers.getContractFactoryFromArtifact(artifact, {
      libraries,
    });
  }

  const events = logs
    .map((receiptLog) =>
      receiptLog.topics[0] === signature && topicsConditional(receiptLog.topics) ? contract.interface.parseLog(receiptLog) : null,
    )
    .filter(Boolean);

  return events;
};


/**
 * @function getEvents - Get the events from a transaction
 * @param {'ERC20' | 'ERC721'} contractType contract that emitted the event
 * @param {*} tx  - The transaction to get the events from
 * @param {EventTypes} eventType - The type of event to get
 * @param {Array<{ [key]: string, address: string }>} libraries - The libraries to link to the contract
 * @returns The emitted events from the transaction
 */
const getEvents = async (contractType, tx, eventType, libraries) => {
  const logs = await getLogs(tx);
  return parseEventsFromLogs(contractType, eventType, logs, libraries);
};

/**
 * @function findEvent - Find an specific event
 * @param {*} events - The list of events
 * @param {*} args - The arguments of the event
 * @returns The event that matches the arguments
 */
const findEvent = (events, { name, from, to, value }) =>
  events.find((e) => {
    const [eventFrom, eventTo, eventValue] = e.args;
    const conditions = [e.name === name, eventFrom === from, eventTo === to, eventValue === value];
    return conditions.every((c) => c);
  });


module.exports = {
  EventTypes,
  getLogs,
  parseEventsFromLogs,
  getEvents,
  findEvent,
};
