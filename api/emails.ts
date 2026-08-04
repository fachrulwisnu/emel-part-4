import { dbGetAllEmails } from '../src/database-service';

export default async function handler(req: any, res: any) {
  try {
    const emails = await dbGetAllEmails();
    return res.status(200).json({
      success: true,
      emails
    });
  } catch (err: any) {
    console.error('API Error in /api/emails:', err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err)
    });
  }
}
