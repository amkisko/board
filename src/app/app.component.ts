import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { Strophe, $pres, $iq, $msg } from 'strophe.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'board';

  session;
  sessionStatus;

  reconnectDelay = 0;

  pingId;
  pingSentAt;
  pingDelay;
  pingInterval;

  mucDomain = 'muc.localhost';

  room = this.newRoom();

  currentMessageId;

  serverAddress;

  @ViewChild('chatboxMessages') chatboxMessagesEl;

  randomColorHex = () =>
    '#' + Math.floor(Math.random() * 16777215).toString(16);

  htmlescape = (str) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/>/g, '&gt;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');

  constructor(private elRef: ElementRef, private route: ActivatedRoute) {}

  ngOnInit() {
    Strophe.addNamespace('PING', 'urn:xmpp:ping');

    Strophe.addNamespace('MUC_OWNER', Strophe.NS.MUC + '#owner');
    Strophe.addNamespace('MUC_ADMIN', Strophe.NS.MUC + '#admin');
    Strophe.addNamespace('MUC_USER', Strophe.NS.MUC + '#user');
    Strophe.addNamespace('MUC_ROOMCONF', Strophe.NS.MUC + '#roomconfig');
    Strophe.addNamespace('MUC_REGISTER', 'jabber:iq:register');

    setInterval(() => {
      this.ping('localhost');
    }, 10000);

    this.route.queryParams.subscribe((params) => {
      console.log(params);
      this.initializeConnection(params.server);
    });
  }

  newRoom() {
    return {
      jid: null,
      nick: null,
      events: [],
      participants: {},
    };
  }

  initializeConnection(serverAddress = null) {
    this.serverAddress = serverAddress && atob(serverAddress)
    if (!this.serverAddress) { return; }

    this.room = this.newRoom();

    this.session = new Strophe.Connection(this.serverAddress, {
      protocol: 'wss',
      mechanisms: [Strophe.SASLAnonymous],
    });

    this.session.addHandler(
      (stanza) => {
        this.onPresence(stanza);
        return true;
      },
      null,
      'presence'
    );

    this.session.addHandler(
      (stanza) => {
        this.onMessage(stanza);
        return true;
      },
      null,
      'message'
    );

    this.session.addHandler(
      (stanza) => {
        this.onSubscriptionRequest(stanza);
        return true;
      },
      null,
      'presence',
      'subscribe'
    );

    this.connect();
  }

  connect() {
    this.session.connect('localhost', null, (status) => {
      this.onConnectionChange(status);
    });
  }

  disconnect() {
    this.session.send(
      $pres({ to: this.room.jid, type: 'unavailable' })
        .c('status')
        .t('Window closed')
    );
    this.session.disconnect();
    this.session = null;
  }

  sendMessage(to, body, type: 'chat' | 'groupchat' = 'chat') {
    const messageId = this.session.getUniqueId();
    this.session.send(
      $msg({
        id: messageId,
        from: this.session.jid,
        to,
        type,
      })
        .c('body')
        .t(body)
    );
    return messageId;
  }

  onSendClick(newMessage) {
    this.currentMessageId = this.sendMessage(
      this.room.jid,
      newMessage.value,
      'groupchat'
    );
    newMessage.value = '';
  }

  isSelfStanza(stanza) {
    return (
      Strophe.getBareJidFromJid(stanza.getAttribute('from')) == this.session.jid
    );
  }

  isRoomStanza(room, stanza) {
    return Strophe.getBareJidFromJid(stanza.getAttribute('from')) == room.jid;
  }

  handleErrors(stanza) {
    const errors = stanza.getElementsByTagName('error');

    if (errors) {
      console.log(errors);
    }

    // errors.forEach((error) => {
    //   console.log('XMPP ERROR: ', error);
    //   // if(child.nodeName != "text" && child.getAttribute("xmlns") == "urn:ietf:params:xml:ns:xmpp-stanzas")
    //   //   err = child.nodeName;
    //   // else if(child.nodeName == "text")
    //   //   text = Strophe.getText(child);
    // });
  }

  newParticipant(nick) {
    return {
      joinedAt: Date.now(),
      color: this.randomColorHex(),
      eventsCount: 0,
    };
  }

  getParticipantColor(nick) {
    return this.room.participants[nick].color;
  }

  onMessage(stanza) {
    const to = stanza.getAttribute('to');
    const type = stanza.getAttribute('type');
    const body = stanza.getElementsByTagName('body');

    const delay = stanza.getElementsByTagName('delay');

    const from = stanza.getAttribute('from');
    const nick = Strophe.getResourceFromJid(from);

    this.handleErrors(stanza);

    switch (type) {
      case 'groupchat':
        const bodyText = Strophe.getText(body[0]);
        if (nick && !this.room.participants[nick]) {
          this.room.participants[nick] = this.newParticipant(nick);
          this.room.participants[nick].eventsCount += 1;
        }
        if (bodyText) {
          this.room.events.push({
            timestamp: Date.now(),
            type: 'message',
            nick: nick,
            text: bodyText,
          });
          setTimeout(() => {
            const box = this.chatboxMessagesEl.nativeElement;
            if (box.scrollHeight - box.scrollTop - box.offsetHeight <= 1000) {
              box.scrollTop = box.scrollHeight;
            }
          }, 10);
        }
        break;
      case 'chat':
        break;
      default:
        break;
    }
  }

  onSubscriptionRequest(stanza) {
    console.log(stanza);
  }

  onPing(stanza) {
    console.log(stanza);
  }

  onPresence(stanza) {
    const to = stanza.getAttribute('to');
    const type = stanza.getAttribute('type');

    const from = stanza.getAttribute('from');
    const nick = Strophe.getResourceFromJid(from);

    this.handleErrors(stanza);

    if (this.isRoomStanza(this.room, stanza)) {
      this.onRoomPresence(this.room, stanza);
    } else {
    }

    console.log(stanza);
  }

  onRoomPresence(room, stanza) {
    const to = stanza.getAttribute('to');
    const type = stanza.getAttribute('type');

    const from = stanza.getAttribute('from');
    const nick = Strophe.getResourceFromJid(from);

    if (room.participants[nick]) {
      if (type == 'unavailable') {
        delete room.participants[nick];
      }
    } else {
      room.participants[nick] = this.newParticipant(nick);
      room.events.push({
        timestamp: Date.now(),
        type: 'presence',
        text: `${nick} joined room`,
      });
    }
  }

  getSessionStatus() {
    return Object.keys(Strophe.Status).find(
      (name) => Strophe.Status[name] == this.sessionStatus
    );
  }

  onConnectionChange(status) {
    this.sessionStatus = status;

    switch (this.sessionStatus) {
      case Strophe.Status.CONNECTING:
        console.log('Strophe is connecting.');
        this.onConnecting();
        break;
      case Strophe.Status.CONNFAIL:
        console.log('Strophe failed to connect.');
        this.onConnectionFailure();
        break;
      case Strophe.Status.DISCONNECTING:
        console.log('Strophe is disconnecting.');
        this.onDisconnecting();
        break;
      case Strophe.Status.DISCONNECTED:
        console.log('Strophe is disconnected.');
        this.onDisconnected();
        break;
      case Strophe.Status.CONNECTED:
        console.log('Strophe is connected.');
        this.onConnected();
        break;
      default:
        break;
    }
  }

  onConnecting() {}

  onConnectionFailure() {}

  onDisconnecting() {}

  onDisconnected() {
    this.pingDelay = null;
    setTimeout(() => {
      if (this.reconnectDelay < 30000) {
        this.reconnectDelay += 1000;
      }
      this.connect();
    }, this.reconnectDelay);
  }

  ping(jid) {
    if (this.pingId || this.sessionStatus != Strophe.Status.CONNECTED) {
      return;
    }

    this.pingId = this.session.getUniqueId('ping');
    this.pingSentAt = Date.now();

    this.session.sendIQ(
      $iq({ type: 'get', to: jid, id: this.pingId }).c('ping', {
        xmlns: Strophe.NS.PING,
      }),
      (stanza) => {
        this.pingId = null;
        this.pingDelay = Date.now() - this.pingSentAt;
      },
      (stanza) => {
        this.pingId = null;
        this.pingDelay = null;
      },
      1000
    );
  }

  onConnected() {
    this.reconnectDelay = 0;
    this.session.send($pres());

    this.room.jid = this.getRoomJid('test1');
    this.room.nick = `user${Math.floor(Math.random() * 1e10)}`;

    this.joinRoom(this.room.jid, this.room.nick, { password: 'secret' });
  }

  getRoomJid(roomName, userName = null) {
    let name = `${roomName}@${this.mucDomain}`;
    if (userName) {
      userName = userName + `/${userName}`;
    }
    return name;
  }

  joinRoom(roomJid, userName, { password = null, history = null }) {
    let stanza = $pres({
      from: this.session.jid,
      to: `${roomJid}/${userName}`,
    }).c('x', {
      xmlns: Strophe.NS.MUC,
    });
    if (history !== null) {
      stanza = stanza.c('history', history).up();
    }
    if (password !== null) {
      stanza.cnode(Strophe.xmlElement('password', [], password));
    }
    this.session.send(stanza.tree());

    stanza = $msg({ to: `${roomJid}`, type: 'groupchat', id: 'state' });
    stanza.c('active', { xmlns: 'http://jabber.org/protocol/chatstates' }).up();
    this.session.send(stanza.tree());
  }

  getId() {
    var t = new Date().getTime();
    return 'id-' + t;
  }

  query(type, to = null, node = null) {
    var stanza = $iq({
      type: 'get',
      id: this.getId(),
      to: to || this.session.domain,
    });
    var query_attributes = {
      xmlns: 'http://jabber.org/protocol/disco#' + type,
    };
    if (node) {
      query_attributes['node'] = node;
    }
    stanza.c('query', query_attributes);
    this.session.send(stanza.tree());
  }

  queryInfo() {
    this.query('info');
  }

  queryItems() {
    this.query('items');
  }
}
