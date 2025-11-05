# **App Name**: LopRok

## Core Features:

- Swipeable Content Feed: Immersive, full-screen feed featuring songs and instrumentals, using a vertical swipe interface (Swiper.js). Includes For You, Following, and Popular feeds.
- User Profile: Profile pages with avatar, banner, bio, stats (followers, following, likes), and content tabs (Creations, Liked, Reposts).
- Record a Song: Full-screen recorder with live camera preview, recording controls, and instrumental audio player. Instrumentals are pre-existing, uploaded by others
- Upload Instrumentals: Create instrumentals by recording/uploading audio with associated metadata.
- Content Upload: Enables posting of 'Teels' (short videos or photos) to a timeline similar to Twitter. Ability to create stories and direct message with other users
- Monetization/Analytics: Creator focused view of revenue generated via Flutterwave/Stripe
- Admin Panel: Two-column dashboard for admins to manage users, content, campaigns, and reports. Includes key metrics, user management (ban, role changes), content moderation, and campaign approval.
- Teel Upload: Upload a Teel which can be a video or a photo to the timeline.
- Instrumental/Beat Upload: Upload an instrumental or a beat, which is an audio file.
- Vocal Recording and Upload: Record and upload vocals over uploaded instrumentals.
- Story Recording and Upload: Record and upload stories.
- Timeline Posting: Post on a timeline that behaves like Twitter.
- Two-User Chat: Chat between two users in a direct message format.
- For You and Following Feeds: Pages displaying the For You and Following feeds.
- Advertisement Upload: Advertisements upload within songs created, which will be a source of revenue.

## Style Guidelines:

- Primary color: Vivid orange (#F06D1A) for main CTAs, active states, and highlights, providing energy and call-to-action.
- Foreground color: Very light gray (#F9FAFC) as the primary text color, ensuring readability against the dark background.
- Background color: Pure black (#000000) for the primary app background.
- Muted/Accent color: Dark grayish-blue (#212936) used as background for cards, inputs, and secondary UI elements, providing contrast without being too harsh.
- Headline font: 'Poppins' (sans-serif) for titles and prominent labels; note: currently only Google Fonts are supported.
- Body font: 'PT Sans' (sans-serif) for descriptions and general UI text; note: currently only Google Fonts are supported.
- Use 'lucide-react' for all interface icons, sized at h-5 w-5 or h-4 w-4 for standard use, ensuring a consistent and modern style.
- Mobile-first, immersive UI with a swipeable feed, centered content on desktop, and fixed sidebars. Components include SongCard, InstrumentalCard, ContentGridItem, and AdBanner.
- Subtle animations and transitions to enhance UX and provide feedback on interactions, particularly in the swipeable feed and content creation flows.