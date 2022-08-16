import { connect, connection } from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || ''

connect(MONGODB_URI)

connection.on('error', console.error.bind(console, 'DB connection error:'))
connection.once('open', () => console.log('Connection to the DB established!'))
