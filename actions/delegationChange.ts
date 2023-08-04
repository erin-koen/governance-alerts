import {
	ActionFn,
	Context,
	Event,
	TransactionEvent,
} from '@tenderly/actions';

import TokenABI from './TokenABI.json'

import { BigNumberish, Interface, formatUnits } from 'ethers';
import axios from 'axios';


export const onDelegationEventEmitted: ActionFn = async (context: Context, event: Event) => {
	try {
		const txEvent = event as TransactionEvent;
		const eventLog = await getDelegationEvent(txEvent)
		const newVotes = formatUnits(eventLog.newBalance, 18)
		const previousVotes = formatUnits(eventLog.previousBalance, 18)
		const delta = Number(newVotes) - Number(previousVotes)
		// Is this a meaningful delegation?
		if (Math.abs(delta) < 100000) {
			return
		}
		// Is this a current delegate's votes changing?
		const topDelegatesRequest = await axios.get<delegateQueryResponse[]>("https://eek-api.vercel.app/api/delegates")

		const isExistingDelegate = topDelegatesRequest.data.find(delegate => {
			return delegate.address.toLowerCase() == eventLog.delegate.toLowerCase();
		})

		// construct message
		const message = isExistingDelegate ? `${isExistingDelegate.name}'s votes have changed. \n Previous balance: ${previousVotes} \n New balance: ${newVotes} \n Delta: ${delta}` : `A new delegate has emerged. ${eventLog.delegate} now has ${newVotes} votes.`
		await postToSlack(message, context)
		return

	} catch (error) {
		console.log({ error })
		throw (error)
	}
}

const getDelegationEvent = (txEvent: TransactionEvent) => {

	const contractInterface = new Interface(TokenABI)
	const delegationTopic = contractInterface.getEvent("DelegateVotesChanged")
	const delegationEventLog = delegationTopic && txEvent.logs.find(log => { return log.topics.find(topic => topic == delegationTopic.name) !== undefined })
	if (!delegationEventLog) {
		throw Error("Delegation event missing")
	}
	return contractInterface.decodeEventLog("DelegateVotesChanged", delegationEventLog.data, delegationEventLog.topics) as unknown as VoteChangedEvent

}

const postToSlack = async (message: string, context: Context) => {
	const url = await context.secrets.get("governanceAlertsChannelWebhook")
	await axios.post(url, { "text": message }, { headers: { "Content-Type": "application/json" } })
}

type VoteChangedEvent = {
	delegate: string;
	previousBalance: BigNumberish;
	newBalance: BigNumberish;
}

interface delegateQueryResponse {
	name: string;
	address: string;
	votes: number
}
