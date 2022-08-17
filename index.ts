import express from 'express'
import { config } from 'dotenv'
import { HmacSHA256 } from 'crypto-js'
import { google } from 'googleapis'

import { authAxios, allowedCategories } from './config'
import RepliedTopic from './db/models/RepliedTopic'

config()
require('./db/connection')

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const SERVICE_EMAIL = process.env.SERVICE_EMAIL || ''
const SERVICE_EMAIL_PRIVATE_KEY = process.env.SERVICE_EMAIL_PRIVATE_KEY || ''
const SPREADSHEET_ID = '1D56OjdxbifGTqXymvK8aoRPN2Y0cO-lkTL1Fc5dJUuY'

const app = express()
app.use(express.json())
const port = process.env.PORT || 5000

const JwtClient = new google.auth.JWT(
  SERVICE_EMAIL,
  undefined,
  SERVICE_EMAIL_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
)
const sheetsClient = google.sheets({ version: 'v4', auth: JwtClient })

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
    // Make it work only for topics created after August 17, 2022 @20:00 and topics with an allowed category
    else if (
      new Date(body.topic.created_at).getTime() >= 1660766400000 &&
      allowedCategories.includes(body.topic.category_id)
    ) {
      const repliedTopics = await RepliedTopic.find({
        topicId: body.topic.id,
      }).select('topicId -_id')
      if (
        !repliedTopics.length &&
        (eventType === 'topic_created' || eventType === 'topic_edited')
      ) {
        await authAxios.post('/posts.json', {
          topic_id: body.topic.id,
          raw: `This post has been reserved for GovAlpha's proposal summary on proposal ${body.topic.title}`,
        })
        await RepliedTopic.create({ topicId: body.topic.id })
        const sheetRes = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Parameters!B2:B3',
        })

        const rowNumber = +sheetRes.data.values?.at(0)?.at(0)
        const refNumber = +sheetRes.data.values?.at(1)?.at(0)

        await sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: 0,
                    dimension: 'ROWS',
                    startIndex: rowNumber,
                    endIndex: rowNumber + 1,
                  },
                  inheritFromBefore: true,
                },
              },
            ],
          },
        })

        await sheetsClient.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: [
              {
                range: `Summary Organizer Sheet!A${rowNumber + 1}`,
                values: [[refNumber + 1]],
              },
              {
                range: `Summary Organizer Sheet!D${rowNumber + 1}`,
                values: [
                  [
                    `=HYPERLINK("https://forum.makerdao.com/t/${body.topic.id}","${body.topic.title}")`,
                  ],
                ],
              },
              {
                range: `Summary Organizer Sheet!T${rowNumber + 1}`,
                values: [
                  [new Date(body.topic.created_at).toLocaleDateString()],
                ],
              },
            ],
          },
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
