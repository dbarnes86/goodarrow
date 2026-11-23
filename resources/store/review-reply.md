# Reply to App Review: Guideline 2.1, information needed

Paste the notes below into App Review Information, Notes, on the version page. Attach the screen recording there too, or upload it somewhere viewable without signing in and put the link in the notes where marked. Then resubmit.

## Notes

```
Thank you for the review. The information requested:

1. Screen recording
Recorded on an iPhone running the latest iOS, starting from launch: [ATTACHED / LINK]
It shows adding players, playing 301 (one of the free games), opening a Pro game, the paywall, a sandbox purchase unlocking Pro, playing Golf, and Restore Purchases and Manage Purchase in Settings. The app has no account registration, login or user-generated content.

2. Purpose and audience
Good Arrows is a scorekeeper for people playing darts on a physical dartboard, at home or in a pub, from one to six players. The board does not keep score; players normally do mental arithmetic or chalk it up. The app does the maths for twelve standard darts games (301/501, Cricket, Killer, Golf, Shanghai and others): it subtracts scores, calls busts, suggests checkouts, tracks lives and turn order, and keeps a record of results. Players enter each dart by tapping what they hit. Nothing is thrown at or detected by the phone.

3. How to use it
No sign-in, credentials or sample files are needed. On first launch the app asks for a player name; tap Done. Add a second player with "+ Add player". Tap 301 and Start game. Tap Treble then 20 three times to score 180; the throw passes to the next player. 301, 501, 701 and Count-Up are free. The other ten games are Good Arrows Pro: tap any game marked PRO to see the paywall with monthly and yearly auto-renewing subscriptions and a one-time lifetime purchase. Restore Purchases is on the paywall and in Settings (top right of the home screen), which also has Manage Purchase.

4. External services
- Apple StoreKit, for the in-app purchases.
- RevenueCat, which checks whether a purchase is active. It receives an anonymous random identifier and the purchase history for this app. No name, email or player data is sent.
The app uses no accounts, analytics, advertising or AI services. All game data stays on the device.

5. Regional differences
None. The app works the same in every region where it is available. It is in English, and it is not offered in China mainland.

6. Regulated industries or third-party material
Not applicable. Darts scoring is not regulated, the app involves no betting or real-money prizes, and it contains no third-party content.
```

## Screen recording, step by step

1. On the iPhone: Settings, Control Centre, add Screen Recording if it is not there.
2. Sign in to the sandbox tester (Settings, Developer, Sandbox Apple Account) so the purchase is free.
3. Delete the app and install build 2 from TestFlight, so it starts fresh and Pro is not already unlocked.
4. Start recording from Control Centre, go to the home screen, and launch the app.
5. Enter a name, add a second player, open 301, start, and tap a few darts including a 180.
6. Go back, tap Golf (PRO), choose Yearly, Continue, and complete the sandbox purchase.
7. When "Pro unlocked" appears, start Golf and score a couple of holes.
8. Open Settings, show Restore Purchases and Manage Purchase.
9. Stop recording. About a minute is plenty.
