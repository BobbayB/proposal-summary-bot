# Forum Proposal Summary bot

A bot to reserve a proposal topic's first reply on Discourse to be later used for GovAlpha's proposal summary

## Requirements

In order to make this bot work, you would need:

- A Discourse webhook for topic events
- A Discourse API key to post replies

## Developer quickstart

- Install the dependencies: `yarn install`
- Copy the contents of the `.env.sample` file into a a new `.env` file and replace with your own information
- Run the bot using `yarn build` and `yarn start` or just `yarn dev` to run the bot with hot reloading
