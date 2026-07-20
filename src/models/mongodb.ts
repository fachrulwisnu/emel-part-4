import mongoose, { Schema, Document } from 'mongoose';

// Interface for Email Document
export interface IEmail extends Document {
  message_id: string;
  subject?: string;
  sender?: string;
  receiver?: string;
  date?: Date | string;
  body_text?: string;
  html_body?: string;
  tags?: any;
  category?: string;
  sub_category?: string;
  folder_parent?: string;
  folder_child?: string;
  api_workflow_status?: string;
  api_workflow_log?: string;
  is_read?: boolean;
  tag_type?: string;
  summary?: string;
  action_required?: boolean;
  suggested_tag?: string;
  is_important?: boolean;
  urgency_level?: string;
  suggested_folder_parent?: string;
  suggested_folder_child?: string;
  is_cit_order?: boolean;
  cit_type?: string;
  suggested_bank?: string;
  extracted_notes?: string;
  currency?: string;
  denomination_suggestion?: number;
  total_amount?: number;
  ai_status?: string;
  attachments?: any;
}

// Interface for EmailAnalysis Document
export interface IEmailAnalysis extends Document {
  message_id: string;
  folder?: string;
  sub_folder?: string;
  tags?: any;
  summary_email?: string;
  summary_attachments?: any;
  attachment_summary?: any; // Alias requested by user instructions
  created_at?: Date | string;
}

// Schema for Email
const EmailSchema: Schema = new Schema({
  message_id: { type: String, required: true, unique: true, index: true },
  subject: { type: String },
  sender: { type: String },
  receiver: { type: String },
  date: { type: Schema.Types.Mixed }, // Accept string ISO dates or real Dates
  body_text: { type: String },
  html_body: { type: String },
  tags: { type: Schema.Types.Mixed, default: [] },
  category: { type: String },
  sub_category: { type: String },
  folder_parent: { type: String },
  folder_child: { type: String },
  api_workflow_status: { type: String },
  api_workflow_log: { type: String },
  is_read: { type: Boolean, default: false },
  tag_type: { type: String },
  summary: { type: String },
  action_required: { type: Boolean, default: false },
  suggested_tag: { type: String },
  is_important: { type: Boolean, default: false },
  urgency_level: { type: String },
  suggested_folder_parent: { type: String },
  suggested_folder_child: { type: String },
  is_cit_order: { type: Boolean, default: false },
  cit_type: { type: String },
  suggested_bank: { type: String },
  extracted_notes: { type: String },
  currency: { type: String },
  denomination_suggestion: { type: Number },
  total_amount: { type: Number },
  ai_status: { type: String },
  attachments: { type: Schema.Types.Mixed, default: [] }
}, {
  timestamps: true,
  strict: false // Allow dynamic/other fields
});

// Schema for EmailAnalysis
const EmailAnalysisSchema: Schema = new Schema({
  message_id: { type: String, required: true, unique: true, index: true },
  folder: { type: String },
  sub_folder: { type: String },
  tags: { type: Schema.Types.Mixed, default: [] },
  summary_email: { type: String },
  summary_attachments: { type: Schema.Types.Mixed },
  attachment_summary: { type: Schema.Types.Mixed }, // Maps to the same or both
  created_at: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  strict: false
});

// Create Mongoose Models
export const Email: any = mongoose.models.Email || mongoose.model<IEmail>('Email', EmailSchema, 'emails');
export const EmailAnalysis: any = mongoose.models.EmailAnalysis || mongoose.model<IEmailAnalysis>('EmailAnalysis', EmailAnalysisSchema, 'email_analysis');
