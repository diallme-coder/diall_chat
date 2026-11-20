import "./style.css";

const HOMESERVER = "https://matrix.org";
const SESSION_KEY = "diall-chat-session-v1";
const MAX_MESSAGE_LENGTH = 4000;

const el = {
  loginView: document.querySelector("#login-view"),
  chatView: document.querySelector("#chat-view"),
  loginForm: document.querySelector("#login-form"),
  loginButton: document.querySelector("#login-button"),
  loginError: document.querySelector("#login-error"),
  matrixId: document.querySelector("#matrix-id"),
  password: document.querySelector("#password"),
  togglePassword: document.querySelector("#toggle-password"),
  roomList: document.querySelector("#room-list"),
  chatCount: document.querySelector("#chat-count"),
  accountName: document.querySelector("#account-name"),
  accountId: document.querySelector("#account-id"),
  accountAvatar: document.querySelector("#account-avatar"),
  logout: document.querySelector("#logout"),
  newChat: document.querySelector("#new-chat"),
  emptyNewChat: document.querySelector("#empty-new-chat"),
  dialog: document.querySelector("#new-chat-dialog"),
  newChatForm: document.querySelector("#new-chat-form"),
  closeDialog: document.querySelector("#close-dialog"),
  recipient: document.querySelector("#recipient"),
  chatName: document.querySelector("#chat-name"),
  newChatError: document.querySelector("#new-chat-error"),
  createChatButton: document.querySelector("#create-chat-button"),
  emptyState: document.querySelector("#empty-state"),
  conversationHeader: document.querySelector("#conversation-header"),
  roomAvatar: document.querySelector("#room-avatar"),
  roomTitle: document.querySelector("#room-title"),
  roomSubtitle: document.querySelector("#room-subtitle"),
  messagePane: document.querySelector("#message-pane"),
  messages: document.querySelector("#messages"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  messageError: document.querySelector("#message-error"),
  backToChats: document.querySelector("#back-to-chats"),
  sidebar: document.querySelector("#sidebar"),
  toast: document.querySelector("#toast"),
};

let client = null;
let selectedRoomId = null;
let toastTimer = 0;
let sdkPromise = null;

function loadMatrixSdk() {
  if (!sdkPromise) sdkPromise = import("matrix-js-sdk");
  return sdkPromise;
}

function showMessage(node, text, kind = "error") {
  node.textContent = text;
  node.className = `form-message ${kind}`;
  node.hidden = false;
}

function hideMessage(node) {
  node.textContent = "";
  node.hidden = true;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove("visible"), 3200);
}

function getRoomMembership(room) {
  return typeof room.getMyMembership === "function" ? room.getMyMembership() : "";
}

function isEncrypted(room) {
  try {
    return Boolean(room?.currentState?.getStateEvents("m.room.encryption", ""));
  } catch {
    return false;
  }
}

function safeRoomName(room) {
  return room.name || "Encrypted conversation";
}

function roomInitial(name) {
  return (name || "D").trim().charAt(0).toUpperCase() || "D";
}

function makeRoomButton(room, invited = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `room-item${room.roomId === selectedRoomId ? " active" : ""}`;
  button.setAttribute("aria-current", room.roomId === selectedRoomId ? "page" : "false");

  const avatar = document.createElement("span");
  avatar.className = "avatar room-avatar";
  avatar.textContent = roomInitial(safeRoomName(room));

  const copy = document.createElement("span");
  copy.className = "room-copy";
  const title = document.createElement("strong");
  title.textContent = safeRoomName(room);
  const detail = document.createElement("small");
  detail.textContent = invited ? "Encrypted invite" : "End-to-end encrypted";
  copy.append(title, detail);

  const badge = document.createElement("span");
  badge.className = "room-lock";
  badge.setAttribute("aria-label", invited ? "Encrypted invitation" : "Encrypted");
  badge.textContent = invited ? "INVITE" : "⌑";

  button.append(avatar, copy, badge);
  button.addEventListener("click", async () => {
    if (invited) {
      button.disabled = true;
      try {
        await client.joinRoom(room.roomId);
        showToast("Joined the encrypted chat.");
      } catch {
        showToast("Could not accept this invitation. Try again.");
      } finally {
        button.disabled = false;
        refreshRooms();
      }
      return;
    }
    selectRoom(room.roomId);
  });
  return button;
}

function refreshRooms() {
  if (!client) return;
  const rooms = client.getRooms().filter((room) => {
    const membership = getRoomMembership(room);
    return (membership === "join" || membership === "invite") && isEncrypted(room);
  });

  rooms.sort((a, b) => safeRoomName(a).localeCompare(safeRoomName(b)));
  el.roomList.replaceChildren();
  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "room-list-empty";
    empty.textContent = "Your encrypted chats will appear here.";
    el.roomList.append(empty);
  } else {
    for (const room of rooms) {
      el.roomList.append(makeRoomButton(room, getRoomMembership(room) === "invite"));
    }
  }
  el.chatCount.textContent = String(rooms.filter((room) => getRoomMembership(room) === "join").length);

  if (selectedRoomId) {
    const selected = client.getRoom(selectedRoomId);
    if (!selected || getRoomMembership(selected) !== "join" || !isEncrypted(selected)) {
      clearConversation();
    } else {
      renderConversation(selected);
    }
  }
}

function messageTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function renderMessages(room) {
  const scrollWasNearBottom =
    el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 120;
  el.messages.replaceChildren();
  const events = room.timeline.filter((event) => {
    const type = event.getType();
    return type === "m.room.message" || type === "m.room.encrypted";
  });

  if (!events.length) {
    const first = document.createElement("div");
    first.className = "first-message";
    first.textContent = "This is the beginning of your encrypted conversation.";
    el.messages.append(first);
  }

  for (const event of events) {
    const content = event.getContent() || {};
    const ownMessage = event.getSender() === client.getUserId();
    const article = document.createElement("article");
    article.className = `message${ownMessage ? " own" : ""}`;

    const author = document.createElement("div");
    author.className = "message-author";
    author.textContent = ownMessage ? "You" : event.getSender() || "Member";

    const bubble = document.createElement("p");
    bubble.className = "message-bubble";
    if (typeof content.body === "string") {
      bubble.textContent = content.body;
    } else {
      bubble.textContent = "This message could not be decrypted on this device.";
      bubble.classList.add("undecrypted");
    }

    const time = document.createElement("time");
    time.className = "message-time";
    time.dateTime = new Date(event.getTs()).toISOString();
    time.textContent = messageTime(event.getTs());

    article.append(author, bubble, time);
    el.messages.append(article);
  }
  if (scrollWasNearBottom) el.messages.scrollTop = el.messages.scrollHeight;
}

function renderConversation(room) {
  if (!isEncrypted(room)) {
    clearConversation();
    showToast("This room is not encrypted, so Diall Chat will not open it.");
    return;
  }
  el.emptyState.hidden = true;
  el.conversationHeader.hidden = false;
  el.messagePane.hidden = false;
  el.roomTitle.textContent = safeRoomName(room);
  el.roomSubtitle.textContent = "Private conversation";
  el.roomAvatar.textContent = roomInitial(safeRoomName(room));
  el.messageInput.disabled = false;
  el.sendButton.disabled = false;
  renderMessages(room);
}

function selectRoom(roomId) {
  const room = client?.getRoom(roomId);
  if (!room || getRoomMembership(room) !== "join" || !isEncrypted(room)) {
    showToast("Only joined, encrypted rooms are available here.");
    return;
  }
  selectedRoomId = roomId;
  renderConversation(room);
  refreshRooms();
  el.sidebar.classList.remove("mobile-hidden");
  if (window.matchMedia("(max-width: 760px)").matches) {
    el.sidebar.classList.add("mobile-hidden");
  }
}

function clearConversation() {
  selectedRoomId = null;
  el.emptyState.hidden = false;
  el.conversationHeader.hidden = true;
  el.messagePane.hidden = true;
  el.messages.replaceChildren();
  el.messageInput.value = "";
  el.messageInput.disabled = true;
  el.sendButton.disabled = true;
}

function showChat(session) {
  el.loginView.hidden = true;
  el.chatView.hidden = false;
  el.accountId.textContent = session.userId;
  el.accountName.textContent = session.userId.split(":")[0].replace(/^@/, "");
  el.accountAvatar.textContent = roomInitial(el.accountName.textContent);
}

function showLogin() {
  el.chatView.hidden = true;
  el.loginView.hidden = false;
  el.password.value = "";
  hideMessage(el.loginError);
  client = null;
  selectedRoomId = null;
}

async function waitForInitialSync(matrixClient) {
  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      matrixClient.removeListener("sync", onSync);
      reject(new Error("The homeserver did not finish syncing in time."));
    }, 45000);

    function onSync(state) {
      if (state === "PREPARED") {
        window.clearTimeout(timer);
        matrixClient.removeListener("sync", onSync);
        resolve();
      } else if (state === "ERROR") {
        window.clearTimeout(timer);
        matrixClient.removeListener("sync", onSync);
        reject(new Error("Could not sync with the Matrix homeserver."));
      }
    }

    matrixClient.on("sync", onSync);
    matrixClient.startClient({ initialSyncLimit: 30 });
  });
}

function attachClientEvents(matrixClient, sdk) {
  matrixClient.on(sdk.RoomEvent.Timeline, (event, room, toStartOfTimeline) => {
    if (!room || toStartOfTimeline) return;
    if (room.roomId === selectedRoomId) renderMessages(room);
    refreshRooms();
  });
  matrixClient.on(sdk.RoomEvent.MyMembership, refreshRooms);
  matrixClient.on("sync", (state) => {
    if (state === "SYNCING" || state === "PREPARED") refreshRooms();
  });
}

async function connectSession(session) {
  const sdk = await loadMatrixSdk();
  const matrixClient = sdk.createClient({
    baseUrl: session.baseUrl,
    userId: session.userId,
    accessToken: session.accessToken,
    deviceId: session.deviceId,
  });
  client = matrixClient;
  await matrixClient.initRustCrypto();
  attachClientEvents(matrixClient);
  await waitForInitialSync(matrixClient);
  showChat(session);
  refreshRooms();
}

function openNewChat() {
  hideMessage(el.newChatError);
  el.newChatForm.reset();
  el.dialog.showModal();
  window.setTimeout(() => el.recipient.focus(), 0);
}

function validMatrixId(value) {
  return /^@[^:\s]+:[^:\s]+$/.test(value);
}

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(el.loginError);
  const rawId = el.matrixId.value.trim();
  const user = rawId.startsWith("@") ? rawId : `@${rawId}:matrix.org`;
  if (!validMatrixId(user) || !user.endsWith(":matrix.org")) {
    showMessage(el.loginError, "Enter a Matrix ID on matrix.org, such as @name:matrix.org.");
    return;
  }

  el.loginButton.disabled = true;
  el.loginButton.querySelector("span").textContent = "Connecting…";
  try {
    const sdk = await loadMatrixSdk();
    const authClient = sdk.createClient({ baseUrl: HOMESERVER });
    const auth = await authClient.login("m.login.password", {
      user,
      password: el.password.value,
      initial_device_display_name: "Diall Chat",
    });
    const session = {
      baseUrl: HOMESERVER,
      userId: auth.user_id,
      accessToken: auth.access_token,
      deviceId: auth.device_id,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    el.password.value = "";
    await connectSession(session);
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
    if (client) client.stopClient();
    client = null;
    const reason = error?.message || "Sign-in failed.";
    showMessage(el.loginError, `${reason} If you do not have an account, create one with Element first.`);
  } finally {
    el.loginButton.disabled = false;
    el.loginButton.querySelector("span").textContent = "Sign in securely";
  }
});

el.togglePassword.addEventListener("click", () => {
  const isHidden = el.password.type === "password";
  el.password.type = isHidden ? "text" : "password";
  el.togglePassword.textContent = isHidden ? "Hide" : "Show";
  el.togglePassword.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

el.newChat.addEventListener("click", openNewChat);
el.emptyNewChat.addEventListener("click", openNewChat);
el.closeDialog.addEventListener("click", () => el.dialog.close());
el.backToChats.addEventListener("click", () => el.sidebar.classList.remove("mobile-hidden"));

el.dialog.addEventListener("click", (event) => {
  if (event.target === el.dialog) el.dialog.close();
});

el.newChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(el.newChatError);
  const recipient = el.recipient.value.trim();
  if (!validMatrixId(recipient) || recipient === client?.getUserId()) {
    showMessage(el.newChatError, "Enter a valid Matrix ID for someone else.");
    return;
  }

  el.createChatButton.disabled = true;
  el.createChatButton.querySelector("span").textContent = "Creating encrypted room…";
  try {
    const name = el.chatName.value.trim() || `Chat with ${recipient}`;
    const result = await client.createRoom({
      name,
      invite: [recipient],
      is_direct: true,
      preset: "private_chat",
      visibility: "private",
      initial_state: [
        {
          type: "m.room.encryption",
          state_key: "",
          content: { algorithm: "m.megolm.v1.aes-sha2" },
        },
      ],
    });
    el.dialog.close();
    showToast("Encrypted room created. Your invitation was sent.");
    selectedRoomId = result.room_id;
    refreshRooms();
  } catch (error) {
    showMessage(el.newChatError, error?.message || "Could not create the encrypted room.");
  } finally {
    el.createChatButton.disabled = false;
    el.createChatButton.querySelector("span").textContent = "Create encrypted chat";
  }
});

el.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = el.messageInput.value.trim();
  if (!body || !client || !selectedRoomId) return;
  if (body.length > MAX_MESSAGE_LENGTH) {
    el.messageError.textContent = `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
    el.messageError.hidden = false;
    return;
  }
  const room = client.getRoom(selectedRoomId);
  if (!room || !isEncrypted(room)) {
    el.messageError.textContent = "This conversation is not encrypted. The message was not sent.";
    el.messageError.hidden = false;
    return;
  }

  el.messageError.hidden = true;
  el.sendButton.disabled = true;
  try {
    await client.sendTextMessage(selectedRoomId, body);
    el.messageInput.value = "";
    el.messageInput.style.height = "";
  } catch {
    el.messageError.textContent = "Message not sent. Check your connection and try again.";
    el.messageError.hidden = false;
  } finally {
    el.sendButton.disabled = false;
    el.messageInput.focus();
  }
});

el.messageInput.addEventListener("input", () => {
  el.messageInput.style.height = "auto";
  el.messageInput.style.height = `${Math.min(el.messageInput.scrollHeight, 160)}px`;
});

el.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.messageForm.requestSubmit();
  }
});

el.logout.addEventListener("click", async () => {
  const currentClient = client;
  sessionStorage.removeItem(SESSION_KEY);
  client = null;
  if (currentClient) {
    currentClient.stopClient();
    try {
      await currentClient.logout();
    } catch {
      showToast("Signed out on this device. The homeserver could not revoke the session.");
    }
  }
  clearConversation();
  showLogin();
});

async function restoreSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    if (
      session.baseUrl !== HOMESERVER ||
      typeof session.userId !== "string" ||
      typeof session.accessToken !== "string" ||
      typeof session.deviceId !== "string"
    ) {
      throw new Error("Stored session is invalid.");
    }
    el.loginView.hidden = true;
    el.chatView.hidden = false;
    await connectSession(session);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    if (client) client.stopClient();
    client = null;
    showLogin();
    showMessage(el.loginError, "Your saved session could not be restored. Please sign in again.");
  }
}

restoreSession();
