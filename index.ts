import express from 'express'
import { config } from 'dotenv'
import { HmacSHA256 } from 'crypto-js'
import { google } from 'googleapis'

import { authAxios, allowedCategories } from './config'
import RepliedTopic from './db/models/RepliedTopic'

config()
require('./db/connection')

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || ''
const SERVICE_EMAIL = process.env.SERVICE_EMAIL || ''
const SERVICE_EMAIL_PRIVATE_KEY = process.env.SERVICE_EMAIL_PRIVATE_KEY || ''
const SPREADSHEET_ID = '1D56OjdxbifGTqXymvK8aoRPN2Y0cO-lkTL1Fc5dJUuY'

const JwtClient = new google.auth.JWT(
  SERVICE_EMAIL,
  undefined,
  SERVICE_EMAIL_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
)
const sheetsClient = google.sheets({ version: 'v4', auth: JwtClient })

// const auth = new GoogleAuth({
//   authClient: servi
// })

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
      new Date(body.topic.created_at).getTime() >= 1660586400000 &&
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
          range: 'Parameters!B2',
        })

        const rowNumber = sheetRes.data.values?.at(0)?.at(0)

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

        await sheetsClient.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `Summary Organizer Sheet!D${rowNumber + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[body.topic.title]],
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
