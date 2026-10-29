// Team chat rules: port of the website's StaffChat.jsx.
// Roles: 'waiter', 'kds' (kitchen) and 'admin'.

bool chatInvolvesMe(Map<String, dynamic> m, String me, String role) {
  if (me.isNotEmpty && m['senderId'] == me) return true;
  if (me.isNotEmpty && '${m['recipientId'] ?? ''}'.isNotEmpty && m['recipientId'] == me) return true;
  if ('${m['recipientId'] ?? ''}'.isEmpty && m['recipientRole'] == role) return true;
  if (role != 'waiter' && (m['senderRole'] == role || m['recipientRole'] == role)) return true;
  return false;
}

bool chatIncoming(Map<String, dynamic> m, String me, String role) {
  if (me.isNotEmpty && m['senderId'] == me) return false;
  if (me.isNotEmpty && '${m['recipientId'] ?? ''}'.isNotEmpty && m['recipientId'] == me) return true;
  if ('${m['recipientId'] ?? ''}'.isEmpty && m['recipientRole'] == role) return true;
  return false;
}

/// A conversation partner: a whole role, or one waiter (for kitchen/admin).
class ChatPeer {
  const ChatPeer.role(this.role)
      : waiterId = '',
        name = '';
  const ChatPeer.waiter(this.waiterId, this.name) : role = 'waiter';
  final String role, waiterId, name;
  bool get isWaiter => waiterId.isNotEmpty;
  String get key => isWaiter ? 'w:$waiterId' : 'r:$role';
}

bool chatInConversation(Map<String, dynamic> m, ChatPeer peer, String me, String role) {
  if (!peer.isWaiter) {
    return (m['senderRole'] == role && m['recipientRole'] == peer.role) || (m['senderRole'] == peer.role && m['recipientRole'] == role);
  }
  final wid = peer.waiterId;
  if (me.isNotEmpty && m['senderId'] == me && m['recipientId'] == wid) return true;
  if (m['senderId'] == wid && m['recipientRole'] == role) return true;
  if ('${m['senderId'] ?? ''}'.isEmpty && m['senderRole'] == 'waiter' && m['recipientRole'] == role && m['senderName'] == peer.name) return true;
  return false;
}

String chatFilter(String me, String role) => role == 'waiter'
    ? 'senderId = "$me" || recipientId = "$me" || (recipientRole = "waiter" && recipientId = "")'
    : 'senderId = "$me" || recipientId = "$me" || recipientRole = "$role" || senderRole = "$role"';
