import express from 'express'
import { config } from 'dotenv'
import { HmacSHA256 } from 'crypto-js'

import { authAxios, unAuthAxios, allowedCategories } from './config'

config()

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const DISCOURSE_API_USERNAME = process.env.DISCOURSE_API_USERNAME || ''

const app = express()
app.use(express.json())
const port = process.env.PORT || 5000

app.post('/', async (req, res) => {
  try {
    const body = req.body
    if (body.ping) {
      res.status(200).end()
      return
    }

    const headers = req.headers
    const headerHash = headers['x-discourse-event-signature']
    const eventType = headers['x-discourse-event']

    const hmac = HmacSHA256(JSON.stringify(body), WEBHOOK_SECRET)
    const hash = `sha256=${hmac}`

    // Perform security verifications
    if (!headerHash) res.status(400).end()
    else if (hash !== headerHash) res.status(403).end()
    else if (!authAxios) res.status(200).end()
    // Make it work only for topics created after July 15, 2022 @18:30 and topics with an allowed category
    else if (
      new Date(body.topic.created_at).getTime() >= 1657909800000 &&
      allowedCategories.includes(body.topic.category_id)
    ) {
      if (eventType === 'topic_created')
        await authAxios.post('/posts.json', {
          topic_id: body.topic.id,
          raw: "This post has been reserved for GovAlpha's proposal summary",
        })
      else if (eventType === 'topic_edited') {
        const topicRes = await unAuthAxios.get(`/t/${body.topic.id}.json`)
        const topicData = topicRes.data
        const latestBotReply = topicData.post_stream.posts
          .reverse()
          .find((post: any) => post.username === DISCOURSE_API_USERNAME)

        if (!latestBotReply)
          await authAxios.post('/posts.json', {
            topic_id: body.topic.id,
            raw: `This post has been reserved for GovAlpha's proposal summary on proposal ${body.topic.title}`,
          })
      }
      res.status(200).end()
    } else res.status(200).end()
  } catch (err) {
    console.log(err)
    res.status(500).json({ success: false, error: err })
  }
})

app.listen(port, () =>
  console.log(`⚡️[server]: Server is running on port ${port}...`)
)

module.exports = app
