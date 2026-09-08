import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('File parse error:', err);
        return res.status(500).json({ error: 'File parse error' });
      }

      // Check if file exists
      const fileArray = files.file || files.files;
      if (!fileArray || fileArray.length === 0) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const file = fileArray[0];

      try {
        // 1. Get Zoho Access Token
        const tokenUrl = `https://accounts.zoho.${process.env.ZOHO_DC}/oauth/v2/token?grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&refresh_token=${process.env.ZOHO_REFRESH_TOKEN}`;
        
        const tokenRes = await fetch(tokenUrl, { method: 'POST' });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
          console.error('Zoho Auth Error:', tokenData);
          return res.status(500).json({ error: 'Failed to authenticate with Zoho' });
        }

        // 2. Upload to Zoho
        const fileData = fs.readFileSync(file.filepath);
        const blob = new Blob([fileData], { type: file.mimetype || 'application/octet-stream' });
        const formData = new FormData();
        formData.append('content', blob, file.originalFilename || 'upload.ext');
        formData.append('parent_id', process.env.ZOHO_FOLDER_ID);
        formData.append('override-name-exist', 'true');

        const uploadUrl = `https://upload.zoho.${process.env.ZOHO_DC}/workdrive/api/v1/upload`;
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        const uploadData = await uploadRes.json();
        
        if (uploadData.data && uploadData.data.length > 0) {
          const permalink = uploadData.data[0].attributes.Permalink;
          return res.status(200).json({ url: permalink, name: file.originalFilename });
        } else {
          console.error('Zoho Upload Error:', uploadData);
          return res.status(500).json({ error: 'Zoho upload failed', details: uploadData });
        }
      } catch (innerErr) {
        console.error('Inner Error:', innerErr);
        return res.status(500).json({ error: innerErr.message });
      }
    });
  } catch (error) {
    console.error('Outer Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
