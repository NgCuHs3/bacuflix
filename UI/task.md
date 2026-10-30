TASK: Redesign BACUFlix Home Screen – Premium Streaming Platform UI

You are a Senior Frontend Engineer and UI/UX Designer specializing in premium streaming platforms such as Netflix, Disney+, and Apple TV+.

Your task is to completely redesign the BACUFlix Home Screen into a polished, cinematic, premium streaming experience.

The design must work seamlessly across three platforms:

1. Mobile (Android / iOS browsers)
2. Desktop Web
3. Smart TV / Android TV

Use the provided BACUFlix UI reference image as the primary visual direction.

Do not simply copy individual elements. Understand the visual language and build a consistent, production-quality design system.

---

1. CORE DESIGN DIRECTION

Brand identity

Brand: BACUFlix

Visual identity:

- Primary background: Near-black (#08090D).
- Secondary background: Dark charcoal (#14151B).
- Primary accent: Streaming red (#E50920).
- Text primary: White (#FFFFFF).
- Text secondary: Gray (#A1A1AA).
- Borders: Subtle dark gray.
- Cards: Dark surfaces with cinematic imagery.
- Typography: Modern sans-serif, bold headings, highly readable metadata.

Design philosophy:

- Premium cinematic experience.
- Minimalist but visually rich.
- Strong visual hierarchy.
- Large movie artwork.
- Smooth transitions and subtle animations.
- Consistent spacing and alignment.
- No unnecessary decorative elements.
- Avoid excessive gradients, glassmorphism, or overly rounded components.

The interface should feel like a real commercial streaming service, not a generic movie catalog.

2. HOME SCREEN STRUCTURE

Implement the following sections in this exact hierarchy.

A. Navigation Header

Desktop

Create a horizontal navigation bar.

Left:

- BACUFlix logo.
- Home.
- Movies.
- TV Shows.
- My List.

Right:

- Search input with search icon.
- Notification icon (if supported).
- User profile/avatar.

Behavior:

- Sticky navigation on scroll.
- Transparent background over the hero initially.
- Transition to a dark opaque background when scrolling.
- Active navigation item indicated by a red underline.
- Smooth hover transitions.

Mobile

Create a compact mobile header:

- BACUFlix logo on the left.
- Search icon.
- Profile icon.

Use a bottom navigation bar:

- Home.
- Movies.
- TV Shows.
- My List.
- Account.

The bottom navigation must respect mobile safe areas and not overlap page content.

Smart TV

Create a TV-friendly navigation layout:

- Larger navigation elements.
- Clear focus states.
- Horizontal navigation.
- Sufficient spacing between items.
- Support directional navigation with remote control.

3. HERO FEATURED MOVIE

This is the most important visual component.

Create a large cinematic hero banner featuring the currently highlighted movie.

Layout:

- Full-width background image.
- Image should occupy approximately 55–70% of the visible hero area.
- Use a left-to-right dark gradient to ensure text readability.
- Add a bottom gradient to blend naturally into the content below.
- Avoid excessive dark overlays that hide the artwork.

Content aligned to the left:

1. FHD / 4K badge.
2. Release year.
3. Subtitle and dubbing information.
4. Large movie title.
5. Short movie description.
6. Primary action buttons.
7. Movie metadata.

Example:

Title: Ngọc Điểm Thú

Metadata:

- 2026
- Vietsub + Thuyết minh
- 45 phút/tập
- 44 tập
- Rating (if available)

Actions:

Primary:

- Play icon + "Xem ngay"
- Red background.
- White text.
- Prominent visual hierarchy.

Secondary:

- Plus icon + "Thêm vào danh sách"
- Dark translucent background.
- Subtle border.

Optional:

- Favorite button.

Interactions:

- Play opens the existing movie playback flow.
- Details opens the existing movie detail page.
- Add to list uses the existing favorites/watchlist functionality.
- Hero carousel automatically changes featured content if the existing application supports it.
- Provide manual carousel navigation.
- Pause automatic rotation when the user interacts with the hero.

Responsive behavior:

Desktop:

- Wide cinematic hero.
- Large typography.
- Text on the left, artwork on the right.

Mobile:

- Portrait-oriented composition.
- Movie artwork above or behind the movie information.
- Title and description below the artwork.
- Full-width primary Play button.
- Compact metadata.
- Avoid horizontal overflow.

TV:

- Large artwork.
- Larger text and buttons.
- Content positioned within TV safe areas.

4. MOVIE CAROUSELS

Build reusable horizontal movie carousel components.

Required sections:

1. Phim mới cập nhật
2. Top 10 hôm nay
3. Phim thịnh hành
4. Phim đề xuất
5. Thể loại
6. Tiếp tục xem
7. Phim bộ nổi bật

Each section contains:

- Section title.
- Optional "Xem tất cả" action.
- Horizontal list of movie cards.
- Smooth horizontal scrolling.
- Navigation arrows on desktop and TV where appropriate.

Movie Card Design

Each movie card should include:

- Poster artwork.
- FHD / 4K badge.
- Episode badge for series.
- Movie title.
- Release year.
- Optional rating.
- Favorite button.

Interaction:

- Hover: Slightly scale the poster.
- Reveal additional movie information where appropriate.
- Show a subtle shadow or elevation.
- Favorite button must not trigger the card's navigation event.
- Click opens the existing movie details page.

Do not make cards excessively large.

Maintain consistent aspect ratios and spacing.

Top 10 Section

Create a special ranking carousel.

Design:

- Large ranking numbers (1–10).
- Movie posters.
- Ranking number partially positioned behind the poster.
- Strong visual contrast.
- Red accent for the ranking section.

The ranking must be based on actual movie data when available.

Continue Watching

Each card includes:

- Landscape thumbnail.
- Movie title.
- Current episode.
- Remaining watch time if available.
- Playback progress bar.
- Resume playback action.

Only render this section when the user has relevant watch history.

5. GENRE SECTION

Create a visually attractive genre browsing section.

Example categories:

- Hành động
- Tình cảm
- Cổ trang
- Hài hước
- Kinh dị
- Khoa học viễn tưởng

Each category:

- Background artwork.
- Dark gradient overlay.
- Genre icon.
- Genre name.
- Hover/focus effect.

Use a consistent card design.

Clicking a genre should navigate to the corresponding existing genre listing.

6. RESPONSIVE DESIGN SYSTEM

This is a critical requirement.

Do not simply scale the desktop layout down to mobile.

Each platform should have a layout optimized for its interaction model.

Desktop Web

Suggested breakpoint:

- Large desktop: >= 1440px
- Desktop: 1024px–1439px
- Tablet: 768px–1023px

Characteristics:

- Wide cinematic hero.
- Horizontal movie carousels.
- Multi-column poster layouts where appropriate.
- Hover interactions.
- Navigation arrows.
- Comfortable spacing.
- Maximum content width where appropriate.

Mobile

Suggested breakpoint:

- Mobile: < 768px

Characteristics:

- Mobile-first composition.
- Compact header.
- Bottom navigation.
- Touch-friendly controls.
- Larger touch targets (minimum approximately 44px).
- Portrait movie posters.
- Swipeable carousels.
- No hover-dependent functionality.
- Avoid tiny metadata.
- Prevent horizontal page overflow.
- Respect safe-area insets.

The mobile layout should feel like a native streaming application.

Smart TV / Android TV

Suggested breakpoint:

- TV: >= 1600px or a dedicated TV layout mode.

Important:
Smart TV is not simply a larger desktop interface.

Optimize for:

- 1920x1080 and 3840x2160 screens.
- Remote control navigation.
- D-pad directional focus.
- Visible focus indicators.
- Large typography.
- Large buttons.
- Comfortable viewing distance.
- TV-safe margins.
- Horizontal browsing.

Implement keyboard/remote navigation:

- Arrow keys: Move focus.
- Enter: Activate focused element.
- Back/Escape: Return to previous navigation context where supported.

Focused cards should:

- Scale slightly.
- Show a clear red or white focus outline.
- Display additional metadata if appropriate.

Avoid relying on mouse hover for TV interactions.

If the project has an existing Android TV environment, follow its established architecture instead of assuming browser-only TV behavior.

7. ANIMATION AND MICRO-INTERACTIONS

Use subtle, performant animations.

Examples:

- Smooth carousel scrolling.
- Movie card hover scaling.
- Fade-in hero content.
- Navigation background transition.
- Button hover and active states.
- Smooth focus transitions on TV.

Guidelines:

- Prefer CSS transforms and opacity.
- Avoid expensive layout animations.
- Respect prefers-reduced-motion.
- Avoid excessive animation.
- Ensure animations do not interfere with navigation or playback.

8. COMPONENT ARCHITECTURE

Build reusable components instead of implementing the entire page as one large component.

Suggested component structure:

HomePage
├── Header
│   ├── DesktopNavigation
│   ├── MobileHeader
│   └── BottomNavigation
├── HeroSection
│   ├── HeroContent
│   ├── HeroActions
│   └── HeroCarouselIndicators
├── ContentSection
│   ├── MovieCarousel
│   ├── MovieCard
│   └── Top10MovieCard
├── GenreSection
│   └── GenreCard
├── ContinueWatchingSection
│   └── ContinueWatchingCard
└── Footer (if appropriate)

You may adjust this architecture based on the existing codebase.

Avoid:

- Duplicated components.
- Huge monolithic components.
- Excessive prop drilling.
- Unnecessary dependencies.
- Hardcoded movie information throughout components.

9. DATA AND EXISTING FUNCTIONALITY

Before coding:

1. Inspect the existing project structure.
2. Identify the current frontend framework and styling system.
3. Identify existing routing.
4. Identify existing API endpoints and data models.
5. Identify existing movie card components.
6. Identify current favorites/watchlist functionality.
7. Identify existing movie detail and playback navigation.
8. Identify responsive behavior and existing TV-specific functionality.

Important:

Preserve existing business logic and functionality.

Do not:

- Replace existing APIs with mock APIs.
- Break existing routes.
- Remove working features.
- Change backend contracts unnecessarily.
- Introduce fake movie data when real API data exists.

Reuse existing services, hooks, state management, and data models.

If a required field is missing, handle it gracefully with sensible fallbacks.

10. PERFORMANCE AND QUALITY

Optimize the home screen for real-world streaming usage.

Requirements:

- Lazy-load movie poster images.
- Use appropriately sized images.
- Avoid unnecessary component re-renders.
- Use stable keys.
- Avoid loading every movie poster at once.
- Implement skeleton loading states.
- Implement empty states.
- Implement API error states.
- Prevent layout shifts when images load.
- Optimize carousel rendering.
- Avoid unnecessary third-party libraries.

Use image aspect ratios consistently:

- Movie posters: 2:3.
- Hero artwork: 16:9.
- Continue watching thumbnails: 16:9.

11. VISUAL QUALITY REQUIREMENTS

The final result must satisfy these requirements:

- Premium Netflix-like visual quality.
- Consistent typography and spacing.
- Cinematic artwork is the visual focus.
- Strong contrast and readability.
- Professional movie cards.
- Beautiful responsive layouts.
- Smooth interactions.
- Consistent design across mobile, desktop, and TV.

Do not create:

- Generic admin-dashboard layouts.
- Excessive rounded cards.
- Excessive gradients.
- Oversized empty spaces.
- Tiny movie posters.
- Inconsistent button styles.
- Random colors.
- Unnecessary decorative icons.
- Desktop layouts squeezed into mobile screens.

12. IMPLEMENTATION WORKFLOW

Follow this workflow:

Phase 1 – Project Analysis

- Inspect the existing codebase.
- Understand the architecture.
- Identify reusable components.
- Identify existing APIs and routes.

Phase 2 – Design System

- Establish color tokens.
- Establish typography.
- Establish spacing.
- Establish responsive breakpoints.
- Establish button and card styles.

Phase 3 – Implementation

- Redesign the navigation.
- Implement the hero section.
- Implement movie carousels.
- Implement Top 10.
- Implement genres.
- Implement Continue Watching.
- Implement responsive layouts for all three platforms.

Phase 4 – Integration

- Connect components to existing APIs.
- Preserve existing navigation.
- Preserve existing user functionality.

Phase 5 – Testing

- Test mobile viewport.
- Test desktop viewport.
- Test TV viewport.
- Test keyboard navigation.
- Test touch interactions.
- Test loading and error states.
- Check for horizontal overflow.
- Check console errors.

Phase 6 – Visual Review

- Run the application.
- Capture screenshots at:
  - 390x844 (Mobile)
  - 768x1024 (Tablet)
  - 1440x900 (Desktop)
  - 1920x1080 (Smart TV)
- Compare the result with the provided reference image.
- Identify visual inconsistencies.
- Fix spacing, sizing, typography, and alignment issues.
- Repeat until the result looks polished.

FINAL DELIVERABLE

Deliver a fully implemented BACUFlix Home Screen.

The result must:

1. Work with the existing project.
2. Support Mobile, Desktop, and Smart TV layouts.
3. Preserve existing functionality.
4. Have reusable components.
5. Have production-quality styling.
6. Have working interactions.
7. Be visually consistent with the provided reference.

Prioritize visual quality and functional correctness over simply finishing quickly.

Do not stop after creating a basic skeleton. Implement the complete home screen, run it, inspect screenshots, and fix visual issues before declaring the task complete.
