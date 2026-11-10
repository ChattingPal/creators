export const DELETE_CONFIRMATION = "DELETE_MY_ACCOUNT";

function jsonResponse(status, body) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function handleDeleteAccount(request, context) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 1024) {
    return jsonResponse(413, { error: "request_too_large" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const requestKeys = Object.keys(body);
  if (requestKeys.length !== 1 || requestKeys[0] !== "confirmation") {
    return jsonResponse(400, { error: "invalid_request" });
  }

  if (body.confirmation !== DELETE_CONFIRMATION) {
    return jsonResponse(400, { error: "confirmation_required" });
  }

  const userId = context.userClaims?.id;
  if (typeof userId !== "string" || !userId) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  try {
    const { error } = await context.supabaseAdmin.auth.admin.deleteUser(userId, false);

    if (error) {
      return jsonResponse(409, { error: "account_deletion_failed" });
    }
  } catch {
    return jsonResponse(500, { error: "account_deletion_failed" });
  }

  return jsonResponse(200, { deleted: true });
}
