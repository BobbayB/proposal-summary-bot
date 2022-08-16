import { model, Schema, Document } from 'mongoose'

interface IRepliedTopic extends Document {
  topicId: string
}

const RepliedTopicSchema = new Schema<IRepliedTopic>({
  topicId: { type: String, required: true, unique: true },
})

const RepliedTopic = model<IRepliedTopic>('RepliedTopic', RepliedTopicSchema)
export default RepliedTopic
