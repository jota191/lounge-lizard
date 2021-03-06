const gui = require('gui')

const AccountsPanel = require('./accounts-panel')
const ChannelsPanel = require('./channels-panel')
const ChatBox = require('./chat-box')
const ChannelsSearcher = require('./channels-searcher')
const UsersSearcher = require('./users-searcher')

const accountManager = require('../controller/account-manager')
const windowManager = require('../controller/window-manager')

class MainWindow {
  constructor() {
    this.window = gui.Window.create({})
    this.window.setTitle(require('../../package.json').build.productName)
    const contentView = gui.Container.create()
    contentView.setStyle({ flexDirection: 'row' })
    this.window.setContentView(contentView)
    this.accountsPanel = new AccountsPanel(this)
    contentView.addChildView(this.accountsPanel.view)
    this.channelsPanel = new ChannelsPanel(this)
    contentView.addChildView(this.channelsPanel.view)

    this.chatBox = new ChatBox(this)
    contentView.addChildView(this.chatBox.view)

    this.channelsSearcher = new ChannelsSearcher(this)
    this.channelsSearcher.view.setVisible(false)
    contentView.addChildView(this.channelsSearcher.view)

    this.usersSearcher = new UsersSearcher(this)
    this.usersSearcher.view.setVisible(false)
    contentView.addChildView(this.usersSearcher.view)

    this.selectedAccount = null
    this.subscription = {
      onAddAccount: accountManager.onAddAccount.add(this.addAccount.bind(this, true)),
      onRemoveAccount: accountManager.onRemoveAccount.add(this.removeAccount.bind(this)),
    }

    windowManager.addWindow(this)
  }

  initWithConfig(config) {
    for (const account of accountManager.accounts)
      this.addAccount(false, account)

    const remembered = accountManager.findAccountById(config.selectedAccount)
    if (remembered) {
      // Choose remembered account.
      this.selectAccount(remembered)
    } else if (accountManager.accounts.length > 0) {
      // Otherwise choose the first account.
      this.selectAccount(accountManager.accounts[0])
    }

    // Show window.
    this.window.setContentSize({ width: 850, height: 600 })
    this.window.center()
    this.window.activate()
  }

  getConfig() {
    return { selectedAccount: this.selectedAccount.id }
  }

  unload() {
    this.subscription.onAddAccount.detach()
    this.subscription.onRemoveAccount.detach()
    if (this.subscription.onUpdateConnection)
      this.subscription.onUpdateConnection.detach()
    this.accountsPanel.unload()
    this.channelsPanel.unload()
    this.chatBox.unload()
    this.channelsSearcher.unload()
    this.usersSearcher.unload()
  }

  setLoading() {
    this.channelsSearcher.view.setVisible(false)
    this.usersSearcher.view.setVisible(false)
    this.chatBox.view.setVisible(true)
    this.chatBox.setLoading()
  }

  selectAccount(account) {
    if (this.selectedAccount === account)
      return
    if (this.selectedAccount)
      this.accountsPanel.findAccountButton(this.selectedAccount).setActive(false)
    if (this.subscription.onUpdateConnection) {
      this.subscription.onUpdateConnection.detach()
      this.subscription.onUpdateConnection = null
    }
    this.selectedAccount = account
    if (!this.selectedAccount)
      return
    this.subscription.onUpdateConnection = account.onUpdateConnection.add(this.updateTitle.bind(this))
    this.accountsPanel.findAccountButton(this.selectedAccount).setActive(true)
    this.channelsPanel.loadAccount(account)
    this.updateTitle()
  }

  async showAllChannels(account) {
    if (!this.selectedAccount)
      return
    this.channelsPanel.selectChannelItem(null)
    this.setLoading()
    const channels = await account.getAllChannels()
    if (this.channelsPanel.selectedChannelItem ||
      this.selectedAccount !== account)  // may switch channel before await
      return
    this.chatBox.view.setVisible(false)
    this.channelsSearcher.loadChannels(account, channels)
  }

  async showThreads(account) {
    if (!this.selectAccount)
      return
    this.channelsPanel.selectChannelItem(null)
    this.setLoading()
    const channels = account.channels
    if (this.channelsPanel.selectedChannelItem ||
      this.selectedAccount !== account)  // may switch channel before await
      return

    let userThreads = [] //to contain only threads that user is involved in

    for (let channel of channels) {
      channel.threads = []
      const messages = await channel.readMessages() //load messages from each channel
      let threadParents = this.getThreadParents(messages) //determine thread parents
      for (let parent of threadParents) {
        let thread = channel.openThread(parent.id) //open threads and save them
        channel.threads.push(thread)
      }

      //load messages for each thread
      for (let thread of channel.threads) {
        thread.messages = await thread.readMessages()
        //console.log(`Account id: ${account.currentUserId}`)
        //console.log(`Thread user id: ${thread.messages[0].user.id}`)
        if(thread.containsMessagesFromUser(account.currentUserId))
          userThreads.push(thread)
      }
    }

    this.threads = userThreads
    this.channelsSearcher.unload()
    this.chatBox.view.setVisible(true)
    this.chatBox.loadThreads(userThreads)
    require('../controller/config-store').serialize()
  }


  //@param messages: list of slack-message objects
  //@return list of messages that are thread parents
  getThreadParents(messages) {
    if (messages) {
      let threads = []
      for (let message of messages) {
        if (message.threadId)
          threads.push(message)
      }
      return threads
    }
    else
      return null
  }

  async showAllUsers(account) {
    if (!this.selectedAccount)
      return
    this.channelsPanel.selectChannelItem(null)

    this.setLoading()
    const users = await account.getAllUsers()
    if (this.channelsPanel.selectedChannelItem ||
        this.selectedAccount !== account)  // may switch channel before await

      return
    this.chatBox.view.setVisible(false)
    this.usersSearcher.loadUsers(account, users)
  }

  addAccount(focus, account) {
    this.accountsPanel.addAccountButton(account)
    if (focus)
      this.selectAccount(account)
  }

  removeAccount(account, index) {
    this.accountsPanel.removeAccountButton(account)
    if (this.selectedAccount === account) {
      if (accountManager.accounts.length === 1) {
        this.selectAccount(null)
        this.channelsPanel.unload()
      } else {
        this.selectedAccount = null
        const newIndex = (index + 1) % accountManager.accounts.length
        this.selectAccount(accountManager.accounts[newIndex])
      }
    }
  }

  updateTitle() {
    if (!this.selectedAccount) {
      this.window.setTitle('Wey')
      return
    }
    const status = this.selectedAccount.status
    let title = this.selectedAccount.name + ' - Wey'
    if (status !== 'connected')
      title += ` (${status.charAt(0).toUpperCase() + status.slice(1)})`
    this.window.setTitle(title)
  }

  loadChannel(channel) {
    this.channelsSearcher.unload()    
    this.usersSearcher.unload()
    this.chatBox.view.setVisible(true)
    this.chatBox.loadChannel(channel)
    require('../controller/config-store').serialize()
  }
}

module.exports = MainWindow
