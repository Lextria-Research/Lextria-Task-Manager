// Temporary diagnostic endpoint to list Zoho WorkDrive folders and find correct folder ID
// DELETE THIS FILE after we find the correct folder ID

export default async function handler(req, res) {
  try {
    // 1. Get access token
    const tokenUrl = `https://accounts.zoho.${process.env.ZOHO_DC}/oauth/v2/token?grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&refresh_token=${process.env.ZOHO_REFRESH_TOKEN}`;
    const tokenRes = await fetch(tokenUrl, { method: 'POST' });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(500).json({ error: 'No token', data: tokenData });
    }

    const workspaceId = req.query?.id || process.env.ZOHO_FOLDER_ID;

    // 2. List folders inside the workspace
    const listUrl = `https://www.zohoapis.${process.env.ZOHO_DC}/workdrive/api/v1/files/${workspaceId}/files?page%5Blimit%5D=50`;
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
    });
    const listText = await listRes.text();

    let listData;
    try {
      listData = JSON.parse(listText);
    } catch(e) {
      return res.status(500).json({ error: 'Failed to parse folder list', raw: listText });
    }

    // 3. Extract folder names and IDs
    const folders = [];
    if (listData.data) {
      for (const item of listData.data) {
        folders.push({
          id: item.id,
          name: item.attributes?.name || item.attributes?.Name || 'unknown',
          type: item.attributes?.type || item.attributes?.Type || 'unknown',
          is_folder: item.attributes?.is_folder || item.attributes?.IsFolder
        });
      }
    }

    return res.status(200).json({
      currentFolderId: workspaceId,
      totalItems: folders.length,
      folders: folders,
      hint: 'Find the Lextria_Uploads folder and copy its "id" field. Then paste it as ZOHO_FOLDER_ID in Vercel.'
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
