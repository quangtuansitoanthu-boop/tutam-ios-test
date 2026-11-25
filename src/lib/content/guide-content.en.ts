import type { GuideSection } from './guide-content';

export const enSoftwareGuideSections: GuideSection[] = [
  {
    "id": "dung-web",
    "icon": "📱",
    "title": "General Guide",
    "shortTitle": "General Guide",
    "keywords": [
      "home",
      "search",
      "dark mode",
      "night mode",
      "epub",
      "practice",
      "reading"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Use Home, Scriptures, Practice, Talks and Profile to navigate. The steps below describe the current interface; some actions appear only for supported content or accounts."
    ],
    "topics": [
      {
        "id": "giao-dien-va-chuyen-dong",
        "title": "Appearance, language and text size",
        "keywords": [
          "motion effects",
          "water ripples",
          "reduced motion",
          "font size",
          "Giao diện, ngôn ngữ và cỡ chữ",
          "Appearance, language and text size"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open settings",
                "text": "Go to Profile → App Settings → Appearance & language. Choose Auto, White, Light beige, Gray, Light purple or Dark, and adjust interface text size."
              },
              {
                "title": "Change language",
                "text": "Select Tiếng Việt or English. When switching to English, let the English books finish downloading. If interrupted, check connection and storage, then choose Retry. Interface language does not mean every recording, cover or recipe is translated."
              },
              {
                "title": "Separate interface and reading sizes",
                "text": "Reading font size is independent of interface size. Use reading settings or the reader tools for font, size and paper background. Motion effects can be disabled; system Reduce Motion is respected."
              }
            ]
          }
        ]
      },
      {
        "id": "widget-man-hinh-chinh",
        "title": "Add a home-screen widget",
        "keywords": [
          "widget",
          "calendar",
          "Dharma audio",
          "practice",
          "home screen",
          "Thêm widget lên màn hình chính",
          "Add a home-screen widget"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose a widget",
                "text": "On Android, long-press a blank home-screen area and open Widgets. On iPhone/iPad, enter home-screen editing and open the widget picker. Find Tu Tập Phật Pháp and select an available Calendar, Practice or Dharma Audio widget and size."
              },
              {
                "title": "Open the relevant screen",
                "text": "Tap the widget content or action to open the corresponding app screen. Widgets use available data; open the app to set up or practise when data is missing. Opening a tool does not mark it complete."
              },
              {
                "title": "Understand refresh timing",
                "text": "The operating system schedules refreshes. A widget may not immediately reflect changes while the app is closed; it is not an alarm or proof that synchronization has finished."
              }
            ]
          }
        ]
      },
      {
        "id": "cap-nhat-noi-dung",
        "title": "Check and download content updates",
        "keywords": [
          "manual content update",
          "new books",
          "download size",
          "Kiểm tra và tải cập nhật nội dung",
          "Check and download content updates"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open from Home",
                "text": "Find Content updates on Home and choose the check action. A connection is required; review the available content and download size before downloading."
              },
              {
                "title": "Watch the download status",
                "text": "Choose the desired updates and wait for completion. If the connection fails or storage is insufficient, resolve it and retry. Starting a download does not mean the content is available offline."
              },
              {
                "title": "Content is separate from the app version",
                "text": "Content updates do not replace App Store or Google Play updates. New features and fixes require the relevant app version."
              }
            ]
          }
        ]
      },
      {
        "id": "trang-chu-va-tim-kiem",
        "title": "Home and the reading library",
        "keywords": [
          "search articles",
          "categories",
          "karma",
          "buddhist sutras",
          "epub",
          "Trang chủ và tìm kinh sách",
          "Home and the reading library"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Use the navigation bar",
                "text": "Open Home, Scriptures, Practice, Talks or Profile. Home contains the lunar calendar, daily reminders, personal observances and a shortcut to the vegan meal calendar."
              },
              {
                "title": "Find a book",
                "text": "In Scriptures, search by title or open Filter. Select a book, open its contents and choose a chapter. Your library helps you return to reading and saved items."
              },
              {
                "title": "Continue reading",
                "text": "Open a recent book or bookmark to return to its saved chapter and position. The catalogue can differ between iOS, Android and the web; some content is only in Vietnamese."
              }
            ]
          }
        ]
      },
      {
        "id": "tu-tap-tren-web",
        "title": "Find a practice tool",
        "keywords": [
          "start practice",
          "floating button",
          "wooden fish",
          "meditation music",
          "auto scroll",
          "Tìm công cụ trong trang Tu tập",
          "Find a practice tool"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose an activity",
                "text": "Practice contains Continue Practice, the balanced vegan meal calendar, Practice routines, My Practice Journal, daily reflection and community access."
              },
              {
                "title": "Open the practice tools",
                "text": "Scroll to meditation, rosary beads, prostrations, sutra or sacred-name copying, precepts, Eight Precepts, restraint, sutras, mantras and rituals. Read the tool instructions before starting."
              },
              {
                "title": "Choose a text",
                "text": "In Recite Sutras, Chant Mantras or Other Rituals, choose a text and chapter. Read any guidance notice shown. Audio and translations are not available for every item."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-nut-quay-lai-android",
        "title": "Back navigation and closing panels",
        "keywords": [
          "back button",
          "android gestures",
          "swipe edge",
          "exit book",
          "table of contents",
          "Quay lại và đóng bảng đang mở",
          "Back navigation and closing panels"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Close the current layer first",
                "text": "Use Close or Back to dismiss a picker, tools panel or dialog before leaving a screen. Android Back participates in this flow; use the in-app back controls on iOS."
              },
              {
                "title": "End sessions deliberately",
                "text": "In beads, meditation, prostrations or routines, distinguish pausing from ending. Read confirmations and save status. Resolve save errors before clearing data or uninstalling."
              }
            ]
          }
        ]
      },
      {
        "id": "doc-offline-khong-can-mang",
        "title": "What works offline?",
        "keywords": [
          "offline",
          "no internet",
          "offline reading",
          "airplane mode",
          "cached",
          "Nội dung nào dùng được khi ngoại tuyến?",
          "What works offline?"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Bundled books and rituals",
                "text": "Content included in the app can open without a connection. Availability depends on platform and version; not every book, image, PDF, translation or video is bundled."
              },
              {
                "title": "Download what you need first",
                "text": "While online, use the supported document or album download action, wait for completion and reopen it to check. Unfinished PDF, audio or video downloads still need a connection. English books download separately apart from bundled rituals."
              },
              {
                "title": "Keep on-device data",
                "text": "Do not clear app data to fix a download. Unsynced copies, notes or practice records may exist only on that device; uninstalling or clearing browser data can remove them."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "doc-sach",
    "icon": "📖",
    "title": "Reading Books, PDFs & Quotations",
    "shortTitle": "Read Books",
    "keywords": [
      "pdf",
      "two page",
      "thumbnail",
      "table of contents",
      "sepia",
      "highlight",
      "notes",
      "tts",
      "offline"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Use the appropriate tools for text books, PDFs and recordings. Bundled content works offline; files not yet on the device must be downloaded first."
    ],
    "topics": [
      {
        "id": "doc-pdf",
        "title": "Open text books and PDFs",
        "keywords": [
          "two page",
          "outline",
          "thumbnail",
          "zoom",
          "fit screen",
          "sepia",
          "Mở sách văn bản và PDF",
          "Open text books and PDFs"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Text books",
                "text": "Select a book in Scriptures, open its contents and choose a chapter. Use Tools to adjust reading. Returning from recent reading or a bookmark restores the saved position when that data is available."
              },
              {
                "title": "PDF documents",
                "text": "Open an item marked PDF and wait for it to load. Use page and zoom controls. Text-book font and size settings do not change the printed lettering inside a PDF page."
              }
            ]
          }
        ]
      },
      {
        "id": "chi-tiet-thanh-cong-cu-doc",
        "title": "Use the reading tools",
        "keywords": [
          "reader tools",
          "font size",
          "font family",
          "bold",
          "line height",
          "paper background",
          "bookmark",
          "listen",
          "share",
          "download",
          "auto scroll",
          "Tùy chỉnh công cụ đọc",
          "Use the reading tools"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Text and background",
                "text": "Open Reading Tools for A−/A+, font, bold text, line spacing and available paper backgrounds. These apply to text content; PDFs have separate controls."
              },
              {
                "title": "Navigate and save positions",
                "text": "Use the contents to change chapters and bookmarks to save and return to positions. Where the practice floating menu is available, ↑ Top and ↓ Bottom jump within the current text."
              },
              {
                "title": "Listen, scroll and share",
                "text": "Use text-to-speech or auto-scroll where supported. Speech depends on the device, language and text; it is separate from recorded Dharma talks. Share a link or export EPUB when the relevant action is available."
              }
            ]
          }
        ]
      },
      {
        "id": "ghi-chu-va-trich-dan",
        "title": "Notes and saved quotes",
        "keywords": [
          "highlight",
          "annotation",
          "personal notes",
          "my quotes",
          "save quote",
          "Ghi chú và trích dẫn đã lưu",
          "Notes and saved quotes"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Select a passage",
                "text": "In text content that supports selection, select a passage and use the available highlight, note or quote action. Check the saved text and destination before leaving."
              },
              {
                "title": "Return and share",
                "text": "Open Profile → Saved quotes. For quote images, preview the result before saving or sharing. On-device saving and account synchronization are different states; check the app status."
              }
            ]
          }
        ]
      },
      {
        "id": "pdf-nghe-va-offline",
        "title": "PDF downloads and text-to-speech",
        "keywords": [
          "tts",
          "read aloud",
          "offline save",
          "indexeddb",
          "Tải PDF và dùng đọc thành tiếng",
          "PDF downloads and text-to-speech"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Save an offline PDF",
                "text": "For supported PDFs, start the download and wait until it completes. Reopen without a connection to check. Retry interrupted downloads instead of clearing app data."
              },
              {
                "title": "Understand speech limits",
                "text": "Text-to-speech needs readable text and a suitable device voice. Scanned image-only PDFs may not contain text to speak. Recorded Dharma audio is played or downloaded in Talks."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "cong-cu-tu-tap",
    "icon": "📿",
    "title": "Cultivation Tools & Practice Tracking",
    "shortTitle": "Practice",
    "keywords": [
      "rosary",
      "mala beads",
      "meditation",
      "timer",
      "goals",
      "heatmap",
      "group practice"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Choose a suitable tool, read its instructions and record the actual practice. Routines combine activities, while vegan menus help plan meals."
    ],
    "topics": [
      {
        "id": "che-do-le-phat",
        "title": "Prostrations and counting",
        "keywords": [
          "prostrations",
          "repentance",
          "Buddha statues",
          "108 bows",
          "21 bows",
          "practice journal",
          "Lễ Phật và ghi nhận số lạy",
          "Prostrations and counting"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Set up",
                "text": "Open Practice → Prostrations & Repentance. Choose the sacred image, target and available options, read the guidance and begin when ready."
              },
              {
                "title": "Practise and finish",
                "text": "Use the counting input shown and check the recorded count. Pause or finish as needed and record actual prostrations. In a routine, finishing a step continues the routine without filling an unmet target."
              }
            ]
          }
        ]
      },
      {
        "id": "che-do-thanh-tinh",
        "title": "Restraint practice and private journal",
        "keywords": [
          "self restraint",
          "Thanh Tinh",
          "Buddha recitation",
          "mantra",
          "wooden fish",
          "bell",
          "Tiết dục bảo thân và nhật ký riêng",
          "Restraint practice and private journal"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open the tool",
                "text": "Choose Practice → Sexual Restraint & Well-being, read the guidance and choose what to track. It supports reflection and habits; seek professional help when health support is needed."
              },
              {
                "title": "Understand storage",
                "text": "Use the visible controls for streaks, resisted urges and writing. The private journal stays on the device and is not automatically synchronized like progress counters. Check sharing options before submitting content."
              }
            ]
          }
        ]
      },
      {
        "id": "cai-dat-nhac-nho-tu-tap",
        "title": "Set reminders and personal observances",
        "keywords": [
          "practice reminders",
          "lunar calendar",
          "vegetarian days",
          "Buddhist observances",
          "morning practice",
          "evening practice",
          "Cài lời nhắc và ngày lễ cá nhân",
          "Set reminders and personal observances"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open reminder settings",
                "text": "In Profile → App Settings, open Lunar calendar & observances for fasting days, Tho Khang Bao Giam and Buddhist observances. Set reminder times and available advance/on-day options."
              },
              {
                "title": "Add a personal date",
                "text": "Use Personal observances on Home or in Settings. Enter a name, choose lunar/Gregorian dates and reminder options. Check the current-year conversion, especially lunar dates and leap months."
              },
              {
                "title": "Check system permissions",
                "text": "Grant notification permission when needed. Review iOS Settings → Notifications; Android may also ask for Alarms & reminders. Battery restrictions, Focus and system settings can delay or hide notifications; exact delivery is not guaranteed in every situation."
              }
            ]
          }
        ]
      },
      {
        "id": "chep-kinh-tren-app",
        "title": "Sutra copying: choose, type and save",
        "keywords": [
          "sutra copying",
          "type scripture",
          "draft",
          "Chép kinh: chọn nguồn, tự gõ và lưu",
          "Sutra copying: choose, type and save"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose a sutra",
                "text": "Open Practice → Sutra copying, choose Ksitigarbha, Lotus or Surangama and a chapter/volume. Open the guide, read it and continue to the copying screen."
              },
              {
                "title": "Use the reference",
                "text": "Select a passage in Reference text and use previous/next, text-size options or collapsed controls. The reference follows typing where supported. Enable Faded Text if desired and type in Your copy."
              },
              {
                "title": "Review and save",
                "text": "Use Review to inspect possible issues; it is a reference check, not an automatic rewrite. Drafts are saved on the device. To save in the account, sign in, choose Save to system and check the result. Uninstalling or clearing data can remove local-only copies."
              }
            ]
          }
        ]
      },
      {
        "id": "trang-hat-ao",
        "title": "Rosary beads: manual and automatic counting",
        "keywords": [
          "digital rosary",
          "mala",
          "automatic rhythm",
          "wooden fish",
          "108 beads",
          "20 bpm",
          "30 bpm",
          "40 bpm",
          "60 bpm",
          "80 bpm",
          "Lần tràng hạt: đếm tay và nhịp tự động",
          "Rosary beads: manual and automatic counting"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open a session",
                "text": "Choose Practice → Rosary Beads, read the introduction and select Begin. In Options, choose a recitation, bead count, target and available sound settings."
              },
              {
                "title": "Count manually",
                "text": "Tap or swipe the beads, or choose Count one bead. On a keyboard, use the indicated key. Review the current count, beads in the strand and completed strands."
              },
              {
                "title": "Use automatic rhythm",
                "text": "Open the automatic-rhythm options, set the pace and start it when needed. Distinguish pause, stop, reset and end-session actions; read the confirmation before resetting. Finish with actual counts, not an assumed completed target."
              }
            ]
          }
        ]
      },
      {
        "id": "so-quan-chieu-ca-nhan",
        "title": "Daily reflection and private writing",
        "keywords": [
          "reflection journal",
          "private diary",
          "good deeds",
          "nickname",
          "body speech mind",
          "Quán chiếu và ghi chép riêng tư",
          "Daily reflection and private writing"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open reflection",
                "text": "In Practice, choose Reflect on today’s good and unwholesome deeds. Read the guide and reflect on actions, areas to improve and the next practice."
              },
              {
                "title": "Choose the destination",
                "text": "Private saving and community sharing are different choices. Share only when you intend to disclose that content. Avoid other people’s sensitive information; a private journal is not automatically a public post."
              }
            ]
          }
        ]
      },
      {
        "id": "cong-dong-sam-hoi-tuy-hy",
        "title": "Community and privacy",
        "keywords": [
          "community",
          "repentance",
          "rejoicing",
          "prayer",
          "encouragement",
          "my posts",
          "Cộng đồng và quyền riêng tư",
          "Community and privacy"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose to participate",
                "text": "Open Join Community or the community practice area, read a goal’s conditions and join if desired. Use the relevant tool. Only eligible sessions contribute under that goal’s rules."
              },
              {
                "title": "Manage visibility",
                "text": "Check sharing, leaderboard and active-practice privacy choices. Pending comments or profiles may not yet be public. Use content or member menus to report or block."
              }
            ]
          }
        ]
      },
      {
        "id": "khoa-le-hang-ngay",
        "title": "Create and follow a practice routine",
        "keywords": [
          "daily routine",
          "prostrations",
          "meditation",
          "mala",
          "custom dedication",
          "Tạo và thực hành thời khóa",
          "Create and follow a practice routine"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Create a routine",
                "text": "Open Practice → Practice routines → Create a routine. Name it and use Add step; at least two steps are required. Available activities include vows and repentance, meditation, beads, prostrations, both copying tools, precepts, Eight Precepts, restraint, sutras, mantras, rituals and dedication."
              },
              {
                "title": "Configure the steps",
                "text": "Expand a step to choose its content and target. Move it up/down or remove it. Select the required text for readings and copying, then save the routine."
              },
              {
                "title": "Follow the sequence",
                "text": "Open the saved routine and start. Pause as needed. Finishing a step continues to the next even if its target was not met. Records keep actual counts and duration; targets are not filled automatically. Check save status before leaving."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-ca-nhan-48-gio",
        "title": "Understand practice saving and synchronization",
        "keywords": [
          "48 hours",
          "personal sync",
          "dedication",
          "restore routines",
          "data savings",
          "Hiểu trạng thái lưu và đồng bộ công phu",
          "Understand practice saving and synchronization"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "On-device saving",
                "text": "The app stores practice data according to each tool. Check My Practice Journal or progress. Copies, private journals, downloaded files and practice records do not all use the same saving mechanism."
              },
              {
                "title": "Account synchronization",
                "text": "Sign in with the same account and connect to synchronize supported data. Some updates are grouped or queued; a 48-hour interval is not proof that everything reached the server. Check status and retry reported failures."
              },
              {
                "title": "Before changing devices",
                "text": "Use Save to system for copies you want stored in the account. Keep the old device data until required records are confirmed saved; offline files and private journals may not be restored on a new device."
              }
            ]
          }
        ]
      },
      {
        "id": "toa-thien-hen-gio",
        "title": "Guided meditation and Focus mode",
        "keywords": [
          "meditation timer",
          "mindfulness bell",
          "sitting practice",
          "Thiền có hướng dẫn và chế độ Tập trung",
          "Guided meditation and Focus mode"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Set up first",
                "text": "Open Practice → Meditation. Choose a duration in Time and review Music, Ambient sound and Background tabs. Motion sensing is optional and is not required to record meditation."
              },
              {
                "title": "Start a session",
                "text": "Select Start meditation. The setup describes preparation time and opening/closing bells. Check volume, silent mode and device permissions if audio is missing. Follow the session timer; bells are not guaranteed alarms when the OS restricts the app."
              },
              {
                "title": "Enter and leave Focus",
                "text": "During a session, choose Focus for a lotus and breathing guidance. Use Exit Focus at the top or supported back navigation to return to controls; the session clock continues. Pausing and ending are separate actions."
              }
            ]
          }
        ]
      },
      {
        "id": "goi-y-va-tien-do",
        "title": "Calendar, practice records and titles",
        "keywords": [
          "lunar calendar",
          "vegetarian days",
          "streak",
          "heatmap",
          "merit dedication",
          "Lịch, công phu và danh hiệu tu tập",
          "Calendar, practice records and titles"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Read the calendar",
                "text": "Home shows lunar/Gregorian dates, a week strip and a month-calendar action. Select a date for its information. Daily reminders do not mark a practice complete."
              },
              {
                "title": "Review practice",
                "text": "Open My Practice Journal or Profile → Practice progress for day, week, month and year views and activity details. Use manual recording for practice outside the app where available."
              },
              {
                "title": "Badges and titles",
                "text": "Home and Account show practice identity from the account’s practice data. Account labels the Practice title. Missing data is different from achieving a rank; check connection and account if synchronization is unfinished."
              }
            ]
          }
        ]
      },
      {
        "id": "an-chay-thuc-don-cong-thuc",
        "keywords": [
          "Ăn chay: thực đơn, công thức và đi chợ",
          "Vegan meals, recipes and shopping"
        ],
        "title": "Vegan meals, recipes and shopping",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open a menu",
                "text": "Open the balanced vegan meal calendar from Home or Practice. In Today, set servings and choose All, North, Central or South. Changing region can change suggested dishes."
              },
              {
                "title": "Read a recipe",
                "text": "Select View beside a dish. Check time, ingredients and cooking steps. Adjust servings or A−/A+ text size. Resting, soaking and steaming times do not necessarily scale with servings. Dish names and recipes may remain Vietnamese in the English interface."
              },
              {
                "title": "Plan shopping",
                "text": "Open Week & shopping for daily planning and shopping information. Today’s ingredients summarizes the current day. Dish menu searches beyond the suggestions. Check ingredients, allergies and household portions; nutrition information is for reference."
              },
              {
                "title": "Use offline",
                "text": "Bundled or previously downloaded menus and recipes work offline. Check and download new weekly content while connected. Not every recipe has a photo or video."
              }
            ]
          }
        ]
      },
      {
        "id": "chep-danh-hieu-tren-app",
        "keywords": [
          "Chép danh hiệu Phật, Bồ Tát",
          "Copy Buddha and Bodhisattva names",
          "chép danh hiệu",
          "sacred names",
          "sacred-name copying"
        ],
        "title": "Copy Buddha and Bodhisattva names",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose a name",
                "text": "Open Copy Buddha and Bodhisattva Names in Practice. Choose the name, read the guide and type in the copying area, following the actual count."
              },
              {
                "title": "Save and return",
                "text": "Check save status and use account saving where offered or required. If opened from a routine, use that flow’s return controls to continue. A target of 108 names is not a completed count."
              }
            ]
          }
        ]
      },
      {
        "id": "giu-gioi-va-bat-quan-trai",
        "keywords": [
          "Giữ giới và Thọ Bát quan trai",
          "Precept Practice and Eight Precepts"
        ],
        "title": "Precept Practice and Eight Precepts",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Precept Practice",
                "text": "Open Practice → Precept Practice to read and reflect on the Five Precepts and Ten Wholesome Actions. Follow the recording controls; entries are personal reflections, not certification by a teacher."
              },
              {
                "title": "Eight Precepts",
                "text": "Open Eight Precepts, read the guidance and rite, check the period and make a personal commitment when ready. Follow the day-and-night practice instructions; the app does not replace guidance from the Sangha or a responsible teacher."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "phap-thoai",
    "icon": "🎧",
    "title": "Dharma Talks & Audio Lectures",
    "shortTitle": "Dharma Talks",
    "keywords": [
      "audio",
      "persistent player",
      "favorites",
      "listen later",
      "speaker",
      "duration"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Find an album, choose a track and use the existing player. Video and offline downloads are available only for supported content; recording language varies."
    ],
    "topics": [
      {
        "id": "dieu-khien-phap-thoai",
        "title": "Listen to talks and watch video",
        "keywords": [
          "mini player",
          "rewind 10s",
          "forward 30s",
          "media session",
          "lockscreen",
          "Nghe pháp thoại và xem video",
          "Listen to talks and watch video"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose an album and track",
                "text": "Open Talks, search or use Search and filters; use Top 10 for the corresponding list. Open an album and choose a track. Supported video albums carry a Video label."
              },
              {
                "title": "Control playback",
                "text": "Use play/pause, seeking and track selection in the player. Resume Listening restores available saved progress. The mini-player returns to the current track across screens without starting a second track."
              },
              {
                "title": "Use full screen",
                "text": "For supported video, open full screen. Controls hide during playback and reappear on a tap, staying visible while paused, loading or interacting. After seeking, allow audio/video to reload; streaming requires a connection."
              }
            ]
          }
        ]
      },
      {
        "id": "luu-va-loc-phap-thoai",
        "title": "Find and download talks for offline use",
        "keywords": [
          "favorites",
          "listen later",
          "recent",
          "speaker",
          "duration",
          "Tìm lại và tải pháp thoại ngoại tuyến",
          "Find and download talks for offline use"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Find content again",
                "text": "Use search, filters, sorting and available recent/favourite lists. Titles, catalogue and language depend on the album; selecting English does not translate a Vietnamese recording."
              },
              {
                "title": "Download supported tracks",
                "text": "Use the download action, sign in if requested and wait for completion. Check the status and reopen offline. Interrupted downloads, missing files or insufficient space can prevent offline playback."
              },
              {
                "title": "Background playback",
                "text": "Background and lock-screen controls depend on platform, content type and device settings. Video and embedded sources may have separate limits; not every source supports downloading or background playback."
              },
              {
                "title": "Listen later",
                "text": "Use the album bookmark icon to add or remove it from Listen Later. Open Listen Later to find selected albums. Bookmarking does not download audio files."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "tai-khoan-dong-bo",
    "icon": "☁️",
    "title": "Account Sync & Cloud Storage",
    "shortTitle": "Cloud Sync",
    "keywords": [
      "google login",
      "cloud sync",
      "backup"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Sign in for supported account and synchronization features. Distinguish device-only data, account-saved data and public content."
    ],
    "topics": [
      {
        "id": "an-toan-cong-dong",
        "title": "Report, block and manage community content",
        "keywords": [
          "report",
          "block",
          "unblock",
          "community",
          "moderation",
          "Báo cáo, chặn và quản lý nội dung cộng đồng",
          "Report, block and manage community content"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Report content",
                "text": "Open a comment, reply or member menu, choose Report and provide the reason. Identify the relevant content without publicly exposing another person’s private information."
              },
              {
                "title": "Block and review privacy",
                "text": "Use Block to limit a member in supported community areas. Review blocked accounts and sharing choices in Settings. Pending and rejected content have separate statuses and are not equivalent to public posts."
              }
            ]
          }
        ]
      },
      {
        "id": "xoa-tai-khoan",
        "title": "Sign out and delete an account",
        "keywords": [
          "delete account",
          "Apple",
          "confirmation code",
          "data",
          "Đăng xuất và xóa tài khoản",
          "Sign out and delete an account"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Find account actions",
                "text": "Open Profile → Account while signed in. Choose Sign out to end the device session. Choose Delete account only when you intend the deletion described in the app confirmation."
              },
              {
                "title": "Read before confirming",
                "text": "Account deletion can remove account-linked data under the policy. Signing out, uninstalling or deleting a downloaded file is not account deletion. If an error occurs, check the status rather than assuming completion."
              }
            ]
          }
        ]
      },
      {
        "id": "ket-noi-facebook-quan-tri",
        "title": "Facebook connection for administrators",
        "keywords": [
          "Facebook connect",
          "Meta app review",
          "user_posts",
          "import source",
          "ledger",
          "reconnect",
          "Kết nối Facebook dành cho quản trị",
          "Facebook connection for administrators"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Separate it from sign-in",
                "text": "Facebook connection or content import is an administrative tool where authorized. It is not a Facebook sign-in instruction for the native app. Regular users do not need it."
              },
              {
                "title": "Use the authorized interface",
                "text": "Follow the actions and permissions actually shown in administration. Do not paste tokens or login details into comments or community support. Contact the administrator if the tool is unavailable."
              }
            ]
          }
        ]
      },
      {
        "id": "dang-nhap-va-dong-bo",
        "title": "Sign in and keep supported data across devices",
        "keywords": [
          "google login",
          "practice history",
          "notes",
          "reading progress",
          "Đăng nhập và giữ dữ liệu giữa các thiết bị",
          "Sign in and keep supported data across devices"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Sign in when needed",
                "text": "Public reading, listening and many practice tools are available as a guest. Open Profile → Account and use an available provider. Native apps offer Google or Apple as applicable; do not expect a Facebook button where none is shown."
              },
              {
                "title": "Use the same account",
                "text": "On another device, choose the same provider and account. Check the profile and synchronization status. Signing in does not prove every local draft, private journal or downloaded file from the old device was uploaded."
              },
              {
                "title": "If reauthentication is needed",
                "text": "Restore the connection and retry as instructed. Preserve unfinished local data before clearing anything. Signing out and deleting an account are different actions; read their confirmations."
              }
            ]
          }
        ]
      }
    ]
  }
];

export const enDoctrinalGuideSections: GuideSection[] = [
  {
    id: 'huong-dan-nguoi-moi',
    icon: '🌱',
    title: 'Beginner’s 4-Stage Guide to Buddhist Practice',
    shortTitle: 'Beginners',
    keywords: ['beginners', 'starting practice', 'four stages', 'karma', 'reincarnation', 'great compassion mantra', 'earth store sutra'],
    editorialStatus: 'verified',
    introduction: [
      'Beginning Buddhist study and daily cultivation can feel overwhelming with countless scriptures, commentaries, and traditions. A grounded, step-by-step path rooted in Right View helps you build unshakeable faith, purify karmic hindrances, and cultivate tangible peace in daily living.',
      'Below is the 4-stage foundation tailored for beginners: from understanding the reality of cause and effect through books, establishing daily mantra recitation, deepening wisdom through ancestral commentaries, to dedicating oneself to a lifelong steadfast practice.',
    ],
    topics: [
      {
        id: 'giai-doan-1-doc-sach-nhan-qua-luan-hoi',
        title: 'Stage 1 — Understanding the Law of Karma & Reincarnation',
        keywords: ['stage 1', 'karma books', 'retribution in this life', 'many lives many times', 'cause and effect'],
        blocks: [
          {
            type: 'callout',
            tone: 'note',
            title: 'First Foundation: Developing Right Faith in the Law of Karma',
            text: 'The Buddha taught: “To know your past causes, look at what you receive in this life; to know your future fruits, look at what you sow in this life.” For newcomers, theoretical abstractions are secondary. First, examine modern real-life karmic accounts to awaken profound faith in karma and rebirth, naturally leading to refraining from unwholesome deeds and cultivating goodness.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Read the Complete “Karmic Retributions in Modern Times” Series (Vol 1–8)',
                text: 'Chronicles compiled by Upasaka Guo Qing under Venerable Master Miao Fa. Real modern accounts reveal the hidden karmic roots behind incurable illnesses, family discord, and sudden bankruptcy—tracing back to killing, abortion, sexual misconduct, theft, or filial impiety. Reading this strikes the heart and inspires a firm resolve to halt all evil actions.',
              },
              {
                title: 'Read “The Mission of Guiding the Departed” (Sứ Mệnh Độ Vong)',
                text: 'Offers compassionate insight into the unseen realm and consciousness after death. Understand the plight of aborted spirits and karmic creditors, transforming baseless fear or superstition into genuine compassion through prayer, chanting, and merit dedication.',
              },
              {
                title: 'Read “An Shi Quan Shu” (An Sỹ Toàn Thư)',
                text: 'A celebrated classic on cause and effect by Upasaka Zhou Anshi, highly praised by Master Yin Guang. It systematically explains karmic consequences, inspiring wholesome conduct and pure moral discipline.',
              },
              {
                title: 'Listen to Audio Lectures on Karma & the Afterlife',
                text: 'Utilize quiet hours or commutes to listen to cautionary karmic lectures and near-death experiences in the Dharma Talks section, deepening confidence in the unseen moral order.',
              },
            ],
          },
          {
            type: 'bullets',
            title: 'Goals Achieved After Stage 1:',
            items: [
              'Eradicating doubts regarding karma, rebirth, and the unseen moral law.',
              'Adopting a vegetarian diet, reducing harm to sentient beings, liberating captive lives, honoring parents, and speaking gently.',
              'Deeply realizing the fleeting nature of life and cultivating a sincere yearning for Dharma practice.',
            ],
          },
        ],
      },
      {
        id: 'giai-doan-2-hang-ngay-tri-tung-chu-dai-bi',
        title: 'Stage 2 — Daily Recitation of the Great Compassion Mantra',
        keywords: ['stage 2', 'daily practice', 'great compassion mantra', 'earth store sutra', 'purifying karma'],
        blocks: [
          {
            type: 'callout',
            tone: 'note',
            title: 'Commencing Practical Cultivation: The Power of Great Compassion Dharani',
            text: 'The Great Compassion Dharani is the sacred heart mantra of Bodhisattva Avalokiteshvara, possessing unfathomable power to dissolve karmic obstacles, heal grievances, and shield body and mind. Regular recitation quickly settles scattered thoughts, dispels anxiety, and brings profound inner tranquility.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Daily Recitation in the Practice Section',
                text: 'Commit to reciting the Great Compassion Mantra at least 5, 7, 21, or 108 times daily. Use the built-in wooden fish sound and mala beads to sustain rhythmic focus.',
              },
              {
                title: 'Study Master Hsuan Hua’s Commentary on the Earth Store Sutra',
                text: 'Listen to Venerable Master Hsuan Hua’s clear, accessible explanation of the Earth Store Sutra, clarifying filial piety, karmic retribution, and the immense vows of Ksitigarbha Bodhisattva.',
              },
            ],
          },
        ],
      },
      {
        id: 'giai-doan-3-sau-6-thang-nghe-kinh-phap-hoa',
        title: 'Stage 3 — Deepening Wisdom with the Lotus Sutra Commentary',
        keywords: ['stage 3', 'lotus sutra', 'hsuan hua', 'wisdom', 'buddha nature'],
        blocks: [
          {
            type: 'paragraph',
            text: 'After steady cultivation for 6 months to a year, listen to Master Hsuan Hua’s commentary on the Lotus Sutra (Saddharma Pundarika Sutra)—the King of Sutras that reveals all sentient beings possess inherent Buddha-nature.',
          },
        ],
      },
      {
        id: 'giai-doan-4-dinh-hinh-phap-mon-chuyen-tu',
        title: 'Stage 4 — Establishing a Steadfast Lifelong Practice',
        keywords: ['stage 4', 'lifelong practice', 'pure land', 'nembutsu', 'chan', 'vows'],
        blocks: [
          {
            type: 'paragraph',
            text: 'Ground your practice firmly in a specific Dharma gate—whether Pure Land mindfulness of Amitabha Buddha, Shurangama Mantra recitation, or Earth Store repentance—persisting daily until liberation.',
          },
        ],
      },
    ],
  },
  {
    id: 'huong-dan-tung-kinh',
    icon: '📖',
    title: 'Guide to Sutra Chanting',
    shortTitle: 'Sutra Chanting',
    keywords: ['sutra chanting', 'morning practice', 'evening practice', 'pregnancy', 'dreams', 'illness', 'earth store sutra'],
    editorialStatus: 'verified',
    introduction: [
      'Chanting sutras involves reciting the Buddha’s sacred words with reverent mindfulness, nurturing understanding, expanding wisdom, and planting wholesome seeds with the Three Jewels.',
    ],
    topics: [
      {
        id: 'thoi-gian-tung-kinh',
        title: 'Ideal Times for Sutra Chanting',
        keywords: ['chanting schedule', 'morning', 'evening', 'vegetarian days'],
        blocks: [
          {
            type: 'cards',
            items: [
              {
                title: 'Daily Practice is Best',
                text: 'If daily recitation is difficult, practice once a week or on lunar observance days (1st, 8th, 14th, 15th, 23rd, 30th of the lunar month) while keeping precepts.',
              },
              {
                title: 'Early Morning or Before Sleep',
                text: 'The mind is clearest at these hours. Morning chanting inspires pure intentions for the day; evening chanting purifies regrets and calms the spirit.',
              },
            ],
          },
        ],
      },
      {
        id: 'hoan-canh-nen-tung-kinh-dia-tang',
        title: 'Occasions for Chanting the Earth Store Sutra',
        keywords: ['earth store sutra', 'pregnancy', 'nightmares', 'departed loved ones', 'serious illness', 'adversity'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'During Pregnancy or Before Childbirth', text: 'Recite the Earth Store Sutra and chant Ksitigarbha’s holy name 10,000 times to dispel ancestral karma and bless the newborn with peaceful longevity.' },
              { title: 'Nightmares or Seeing the Departed in Dreams', text: 'Often indicates departed relatives seeking wholesome merits. Dedicate 3 to 7 recitations of the Earth Store Sutra for their liberation.' },
              { title: 'Severe Family Illness', text: 'Chanting on behalf of an ailing person or sponsoring sutra distributions helps eradicate weighty karma and ease distress.' },
              { title: 'Within 49 Days of a Passing', text: 'During the 49-day bardo state, dedicate sincere recitations to assist the departed soul into a peaceful rebirth.' },
              { title: 'Facing Hardships & Major Obstacles', text: 'Commit to a 7-day, 21-day, or 49-day recitation vow with 1,000 daily repetitions of Ksitigarbha Bodhisattva’s sacred name.' },
            ],
          },
        ],
      },
      {
        id: 'luu-y-khi-tung-kinh',
        title: 'Mindful Guidelines for Chanting',
        keywords: ['guidelines', 'sincerity', 'reverence', 'dedication'],
        blocks: [
          {
            type: 'bullets',
            title: 'Essential points to remember:',
            items: [
              'Chant clearly, steadily, and reverently—depth of mindfulness matters far more than speed.',
              'An altar is not strictly required—any clean, quiet, and respectful space is suitable.',
              'In public or crowded places, recite silently in your heart.',
              'Cleanse your hands, rinse your mouth, and dress modestly before opening the scriptures.',
              'Always conclude by dedicating all accumulated merits to all sentient beings.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'huong-dan-tri-chu',
    icon: '📿',
    title: 'Guide to Mantra Recitation (Dharani)',
    shortTitle: 'Mantra',
    keywords: ['mantra', 'dharani', 'recitation', 'pure land', 'great compassion mantra', 'shurangama mantra'],
    editorialStatus: 'verified',
    introduction: [
      'A Mantra (Dharani) embodies the mystic syllables of Buddhas and Bodhisattvas, functioning as an armor for body and mind to eliminate karma and awaken inner wisdom.',
    ],
    topics: [
      {
        id: 'phan-biet-tri-va-niem-chu',
        title: 'Reciting from Memory vs. Reading Mantras',
        keywords: ['memorization', 'mindful chanting'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Holding Mantras (Trì Chú)', text: 'Reciting fluently from memory in continuous cycles. This represents formal core cultivation.' },
              { title: 'Reading Mantras (Niệm Chú)', text: 'Chanting while reading text. Sincere devotion still yields immense, inconceivable merit.' },
            ],
          },
        ],
      },
      {
        id: 'tri-chu-va-niem-phat-ket-hop',
        title: 'Combining Mantra Recitation with Buddha Mindfulness',
        keywords: ['primary practice', 'supportive practice', 'pure land', 'amitabha'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Buddha Mindfulness as Primary Practice', text: 'If aspiring for Western Pure Land, recite "Namo Amitabha Buddha" as your core foundation.' },
              { title: 'Mantras as Supportive Cultivation', text: 'Reciting the Great Compassion or Shurangama Mantra helps dissolve karmic obstructions and stabilizes the mind.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'tho-tuong-tai-gia',
    icon: '🪔',
    title: 'Setting Up an Altar & Sacred Statues at Home',
    shortTitle: 'Altar Setup',
    keywords: ['buddhist altar', 'statues', 'ksitigarbha', 'respectful placement', 'home worship'],
    editorialStatus: 'verified',
    introduction: [
      'Setting up a Buddhist altar at home can be done sincerely by yourself. Direct devotion and genuine respect yield pure, complete merit for the entire household.',
    ],
    topics: [
      {
        id: 'buoc-1-tam-tuong-khi-nhan-ve',
        title: 'Step 1 — Cleansing the Sacred Statue',
        keywords: ['cleansing statue', 'pure water', 'respectful handling'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Prepare Dedicated Utensils', text: 'Prepare pure warm water, fragrant herbs/cleansing essence, a dedicated clean basin, and a fresh clean towel.' },
              { title: 'Receive with Both Hands', text: 'Hold the sacred statue with both hands and reverent mind. Gently cleanse the image and dry it with the dedicated cloth.' },
              { title: 'Store Utensils Respectfully', text: 'Keep these utensils in a clean place exclusively for future statue cleanings.' },
            ],
          },
        ],
      },
      {
        id: 'buoc-2-an-vi-tuong-va-doc-bai-thinh',
        title: 'Step 2 — Enshrining the Statue & Sincere Invocation',
        keywords: ['enshrining', 'altar placement', 'prayers'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Altar Placement', text: 'Place the statue on a clean, elevated altar. If sharing an altar with ancestors or guardian deities, the Buddha/Bodhisattva must be elevated higher.' },
              { title: 'Chant Great Compassion Mantra', text: 'Recite 7 to 21 recitations of the Great Compassion Mantra with pure devotion.' },
              { title: 'Read the Invocation Prayer (3 Times)', text: 'Sincerely recite the prayer inviting the Bodhisattva’s compassionate presence to guide your family toward wholesome virtues.' },
              { title: '7 Days of Dedicated Sutra Recitation', text: 'For the next 7 days, recite the Earth Store Sutra or Amitabha Sutra once daily to consecrate the home altar.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'thuc-hanh-hang-ngay',
    icon: '📋',
    title: 'Daily Cultivation Routine & Living Mindfully',
    shortTitle: 'Daily Practice',
    keywords: ['daily routine', 'morning vow', 'daytime virtue', 'evening repentance', 'core principles'],
    editorialStatus: 'verified',
    introduction: [
      'A regular, mindful daily routine steadily transforms karmic tendencies and establishes enduring peace for yourself and your family.',
    ],
    topics: [
      {
        id: 'khung-thoi-khoa-trong-ngay',
        title: 'Daily Practice Schedule',
        keywords: ['morning', 'daytime', 'evening', 'repentance', 'merit dedication'],
        blocks: [
          {
            type: 'steps',
            items: [
              {
                title: 'Morning — Awakening Wholesome Intentions',
                text: 'Upon waking, spend 5 minutes reciting holy names and renew your vow: "Today I resolve to do good, refrain from evil, help sentient beings, and maintain a pure heart." Then chant your morning session.',
              },
              {
                title: 'Daytime — Practicing Kindness & Silent Chanting',
                text: 'Help others in small, practical ways. Use idle moments while walking, commuting, or cooking to silently repeat the Buddha’s name.',
              },
              {
                title: 'Evening — Repentance & Merit Dedication',
                text: 'Before sleep, reflect upon the day. Acknowledge mistakes with sincere repentance, and dedicate all day’s merits to all living beings.',
              },
            ],
          },
        ],
      },
      {
        id: 'nguyen-tac-cot-loi',
        title: 'Core Cultivation Principles',
        keywords: ['consistency', 'sincerity', 'five precepts', 'patience'],
        blocks: [
          {
            type: 'bullets',
            items: [
              'Consistency is paramount — 15 mindful minutes every day is far superior to 3 hours once a week.',
              'Sincere heart outweighs mere form — 5 minutes of focused chanting surpasses an hour of distracted recitation.',
              'Ethical foundation: Uphold the Five Precepts (no killing, stealing, sexual misconduct, lying, or intoxicants).',
              'Patience and perseverance — Dharma cultivation is a lifelong cultivation, not a rapid pursuit of results.',
            ],
          },
        ],
      },
    ],
  },
  {
    "id": "bo-thi-may-nghe-phap",
    "icon": "📻",
    "title": "Dharma Giving — Offering Recitation Players",
    "shortTitle": "Dharma Giving",
    "keywords": [
      "Dharma giving",
      "recitation player",
      "memory card",
      "MicroSD",
      "FAT32",
      "spirits"
    ],
    "editorialStatus": "verified",
    "introduction": [
      "“Dharma giving surpasses all giving” (Dhammapada, verse 354). Offering recitation players shares teachings and Buddha-name recitation with a compassionate intention."
    ],
    "topics": [
      {
        "id": "y-nghia-va-cong-duc-phap-thi-may-nghe-phap",
        "title": "Meaning & Intention of Offering Recitation Players",
        "keywords": [
          "Dharma giving",
          "merit",
          "Buddha recitation"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Offering a Dharma or Buddha-recitation player is a way to share the teachings. Approach it with compassion, without fear, personal gain or requests for wealth from spirits."
          }
        ]
      },
      {
        "id": "chuan-bi-may-va-the-nho-nghe-phap",
        "title": "Prepare a Player & Memory Card",
        "keywords": [
          "memory card",
          "4GB",
          "FAT32",
          "MicroSD"
        ],
        "blocks": [
          {
            "type": "callout",
            "tone": "note",
            "title": "Choose a player with a memory-card slot",
            "text": "Some inexpensive players contain fixed recordings and cannot accept new files. Choose a model with a MicroSD/TF slot or USB input that supports copying your selected audio."
          },
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose the player",
                "text": "Check the supported audio format, memory capacity, power supply and intended indoor or outdoor use."
              },
              {
                "title": "Prepare a 4GB MicroSD card",
                "text": "The existing guide uses a 4GB MicroSD card formatted as FAT32. Check compatibility with the chosen player before copying files."
              },
              {
                "title": "Set repeat playback",
                "text": "Insert the card and use Mode or Repeat to choose one-track or whole-list repetition, following the device instructions."
              }
            ]
          }
        ]
      },
      {
        "id": "vi-tri-dat-may-va-cach-che-chan-ngoai-troi",
        "title": "Placement & Weather Protection",
        "keywords": [
          "outdoor",
          "weather",
          "cemetery",
          "volume"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Choose a suitable location only with the permission of the site’s owner or manager. Keep the player dry and ventilated, protect it appropriately for its rated use, and check it periodically."
          },
          {
            "type": "paragraph",
            "text": "Secure it safely and keep the sound gentle, audible within about 3–5 metres as suggested in the original guide. Respect nearby residents and visitors; do not obstruct walkways or disturb the site."
          }
        ]
      },
      {
        "id": "tam-luong-va-nghi-thuc-khan-nguyen",
        "title": "Compassionate Intention & Dedication",
        "keywords": [
          "compassion",
          "prayer",
          "dedication"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Keep a sincere, compassionate intention rather than seeking personal gain. Dedicate the merit of your daily practice to the beings you wish to benefit."
          },
          {
            "type": "paragraph",
            "text": "Check the battery, clean the case and recharge when necessary."
          }
        ]
      },
      {
        "id": "tai-ve-cac-bai-phap-tuyen-chon-cho-the-nho",
        "title": "Download the Selected Audio for a Memory Card",
        "keywords": [
          "download",
          "memory card",
          "Google Drive",
          "extract"
        ],
        "blocks": [
          {
            "type": "bullets",
            "title": "Original titles in the selected archive",
            "items": [
              "1. Kinh Địa Tạng Bồ Tát Bổn Nguyện (Diễn đọc trọn bộ) — bộ kinh căn bản độ âm thù thắng.",
              "2. Thần Chú Tôn Thắng Phật Đảnh Đà La Ni (21 biến) — oai lực đệ nhất tiêu trừ ác nghiệp, cứu bạt địa ngục.",
              "3. Bài khai thị cho Hương Linh, Vong Linh (Cửu Huyền Thất Tổ).",
              "4. Lời khai thị cho người sắp lâm chung.",
              "5. Nam Mô Địa Tạng Vương Bồ Tát (Thầy Thích Trí Thoát tụng).",
              "6. Kinh Phổ Môn Diễn Đọc (Quán Thế Âm Bồ Tát cứu khổ cứu nạn).",
              "7. Nam Mô Quan Thế Âm Bồ Tát.",
              "8. Kinh A Di Đà diễn đọc.",
              "9. Nam Mô A Di Đà Phật (bản mới trang nghiêm thanh tịnh).",
              "10. Kinh Đại Thừa Vô Lượng Thọ (HT. Thích Đức Niệm dịch).",
              "11. Tán Thán Phật A Di Đà Và Cõi Cực Lạc.",
              "12. Kinh Quán Vô Lượng Thọ Phật.",
              "13. Quê Hương Cực Lạc (Hòa thượng Tuyên Hóa khai thị).",
              "14. Kinh Nghiệp Báo Sai Biệt.",
              "15. Kinh Nhân Quả Ba Đời.",
              "16. Diễn đọc Kinh Thập Thiện Nghiệp Đạo.",
              "17. Kinh Dược Sư Lưu Ly Quang Như Lai Bổn Nguyện Công Đức.",
              "18. Nam Mô Dược Sư Lưu Ly Quang Vương Phật (Thầy Thích Trí Thoát tụng).",
              "19. Kinh Hoa Nghiêm — Phẩm Phổ Hiền Hạnh Nguyện.",
              "20. Phẩm 5: Diệt Trừ Nghiệp Chướng (Kinh Ánh Sáng Hoàng Kim).",
              "21. Kinh Đại Bi Tâm Đà La Ni.",
              "22. Chú Đại Bi tiếng Phạn 21 biến (Quang Từ).",
              "23. Kinh Đại Thừa Trang Nghiêm Bảo Vương.",
              "24. Om Mani Padme Hum (Lục Tự Đại Minh Chú).",
              "25. Kinh Phật Đảnh Tôn Thắng Đà Ra Ni.",
              "26. Kinh Đại Thừa Công Đức Tạo Tượng Phật và Phát Bồ Đề Tâm Văn.",
              "27. Kinh Phước Báo Của Tạo Lập Hình Tượng Phật.",
              "28. Kinh Quán Thế Âm Bồ Tát Thọ Ký.",
              "29. Diễn đọc Phật Thuyết Kinh Từ Thị Bồ Tát Đại Thành Phật."
            ]
          },
          {
            "type": "steps",
            "items": [
              {
                "title": "Download and extract",
                "text": "Open the author’s Google Drive archive below and download it to a computer or phone. Extract the archive to obtain its MP3 files."
              },
              {
                "title": "Copy to the card",
                "text": "Format the compatible 4GB card as FAT32 and copy the extracted MP3 files to the card’s root folder. Insert it in the player and check playback."
              },
              {
                "title": "Ask for help if needed",
                "text": "A phone or computer shop can help download, extract and copy the files. Share the archive link rather than account credentials."
              }
            ]
          },
          {
            "type": "link",
            "href": "https://drive.google.com/file/d/1QSNeYvzkTMsNorQ_23b3W1TIYrQekYeH/view?usp=sharing",
            "externalActions": true,
            "label": "Download the selected Dharma audio archive",
            "text": "The author’s existing Google Drive archive; download and extract the files before copying them to the card.",
            "buttonLabel": "Open Google Drive"
          }
        ]
      }
    ]
  },
  {
    id: 'gioi-thieu-tac-gia',
    icon: '👤',
    title: 'About the Author & Purpose',
    shortTitle: 'Author Info',
    keywords: ['quang tu', 'ngo quang tu', 'author', 'lay practitioner', 'pure land', 'dharma sharing'],
    editorialStatus: 'verified',
    introduction: [],
    topics: [
      {
        id: 'tieu-su-quang-tu',
        title: 'Lay Practitioner Ngo Quang Tu & Vow of Service',
        keywords: ['quang tu', 'biography', 'online monastery', 'free dharma'],
        blocks: [
          {
            type: 'paragraph',
            text: "I am the lay practitioner Ngộ Quang Từ, usually known as Quang Từ, a child of the Buddha with a deep connection to the Dharma. In my life I have faced many upheavals, adversities and trials that once seemed impossible to overcome. In those dark and difficult moments, my fortunate encounter with the wondrous Dharma helped me gradually understand the profound truths taught by the Buddha, especially an unshakable faith in the law of karma and its consequences. Through years of personal reflection and practice, I have come to see this encounter not as a coincidence within this life, but as the continuation of wholesome roots and connections cultivated over countless past lives.",
          },
          {
            type: 'paragraph',
            text: "On my path of Buddhist learning and practice, I always hold deep gratitude for the boundless compassion of Kṣitigarbha Bodhisattva of the Great Vow and Avalokiteśvara Bodhisattva of Great Compassion. They have sheltered, illuminated and guided me through difficult times, helping me transform my heart, resolve grievances and rise again after setbacks. From sincere gratitude to the Three Jewels and the great Bodhisattvas, I have made a heartfelt vow to dedicate this humble body and mind to sharing the true Dharma, spreading the light of awakening and the precious teachings of the Buddhas and patriarchs, and nurturing wholesome connections for those seeking a path beyond suffering.",
          },
          {
            type: 'paragraph',
            text: "I previously had the good fortune to help share the Dharma on Ms. Thạch Mỹ Nghi’s Ngọc Lịch Bửu Phiêu page, sharing lessons on karma, the consequences of good and harmful actions, filial devotion, and practical ways to transform suffering in family and social life. During my dedicated study and spiritual practice, I have had deeply meaningful spiritual experiences that have strengthened my faith in karmic rebirth and the existence of unseen realms within the Dharma realm.",
          },
          {
            type: 'paragraph',
            text: "Understanding that the demands and temptations of the digital age can draw people into worries, status and gain, leaving them anxious, lonely and lost, I devoted my efforts to creating the Tu Tập Phật Pháp application. It is designed as a dignified, peaceful online practice space where anyone, however busy or far from a temple, can use a phone to practice, bow to the Buddha, recite the Buddha’s name, meditate, copy sutras and listen to Dharma teachings. The application is offered completely free of charge in a spirit of selfless service, with the wish to help people trust deeply in karma, abandon harmful actions, cultivate good deeds, transform karmic tendencies and rediscover inner peace.",
          },
          {
            type: 'paragraph',
            text: "For the Tu Tập Phật Pháp application to come into being, develop and serve Buddhist practitioners as it does today, I offer my deepest and most sincere gratitude to my wife, Ms. Ôn Nhật Nga, who has stood beside me with understanding, sacrifice and wholehearted support throughout its creation; Mr. Nguyễn Anh Tuấn, Director of Công ty Cổ phần SMOB - SMOB Joint Stock Company, for his dedicated technical expertise and sponsorship of application distribution infrastructure, helping it operate smoothly and reliably on Apple devices (iOS/macOS/iPadOS); Quang Chiến, for his devoted help in building and operating the backend server system and keeping the infrastructure available and secure; Đỗ Chân Đức, for generously providing the rights to include the two valuable works “Sứ Mệnh Độ Vong” and “Sứ Mệnh Thầy Pháp” in the application’s library; and the entire Buddhist community and fellow practitioners near and far who have enthusiastically helped test for errors and contributed valuable feedback during development. I dedicate all merit from creating this application to all beings throughout the Dharma realm, that they may soon enter deeply into the Buddha’s teachings, purify karmic obstacles and become adorned with merit and wisdom. May you and your families enjoy peace in body and mind, auspicious conditions, steadfast bodhicitta and fulfillment in diligent practice on the path to liberation!",
          },
          {
            type: 'paragraph',
            text: "For questions about the application or the content shared within it, you may contact me directly through the Facebook account or Messenger link below. Thank you sincerely for visiting and accompanying the Tu Tập Phật Pháp application.",
          },
          {
            type: 'link',
            href: 'https://m.me/tranan.buhd',
            label: 'Message via Messenger',
            text: 'Connect or ask questions directly via Messenger (m.me/tranan.buhd)',
          },
          {
            type: 'link',
            href: 'https://www.facebook.com/tranan.buhd/',
            label: 'Personal Facebook Page',
            text: 'Visit Quang Tu’s Facebook profile (facebook.com/tranan.buhd)',
          },
        ],
      },
    ],
  },
  {
    id: 'hoi-dap-thuong-gap',
    icon: '❓',
    title: 'Frequently Asked Questions (FAQ)',
    shortTitle: 'Q & A',
    keywords: ['faq', 'working hours', 'menstruation', 'no altar', 'browser data', 'computer'],
    editorialStatus: 'verified',
    introduction: ['Quick guidance on common questions regarding daily practice at home and using the app.'],
    topics: [],
    faqs: [
      {
        id: 'faq-ban-di-lam-tu-luc-nao',
        question: 'I work full-time all day. When is the best time to practice?',
        keywords: ['busy', 'work schedule', 'morning', 'evening'],
        answer: ['Select a time slot you can maintain consistently: before leaving for work, after returning home, or during a quiet evening break. A focused 5–15 minute session daily is far more sustainable than irregular marathon sessions.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-phu-nu-toi-ngay',
        question: 'Can women chant sutras or light altar incense during menstruation?',
        keywords: ['menstruation', 'incense', 'altar', 'precepts'],
        answer: ['Yes, absolutely. Menstruation is a natural physiological function, not a moral fault or ritual pollution. Maintain clean attire and practice with a peaceful, respectful mind.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-khong-co-ban-tho',
        question: 'Can I chant on the app if I don’t have an altar at home?',
        keywords: ['no altar', 'chant at home', 'phone app'],
        answer: ['Yes. You can recite anywhere that is clean, quiet, and respectful. Sincere reverence directed toward the Buddha in your heart is what truly matters.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-xoa-trinh-duyet',
        question: 'Will my cultivation streak be lost if I clear browser cache?',
        keywords: ['cache', 'clear data', 'lost data', 'sync'],
        answer: ['Before clearing app data or switching devices, sign in, connect to the internet and verify that eligible progress has synced. Use Save to account for sutra copies. Downloaded PDFs and audio stay on this device and need to be downloaded again on another device.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-dung-tren-may-tinh',
        question: 'Can I use this app on desktop computers and laptops?',
        keywords: ['desktop', 'laptop', 'windows', 'mac', 'pwa'],
        answer: ['Yes. Open the website in a desktop browser to read, listen or practice. If your browser supports installation, follow the website’s installation guide. Phone features such as home-screen widgets depend on the platform.'],
        editorialStatus: 'verified',
      },
    ],
  },
];

export const enGuideJumpLinks = [
  { id: 'cai-app', icon: '📱', label: 'Install App' },
  { id: 'dung-web', icon: '📱', label: 'General Guide' },
  { id: 'doc-sach', icon: '📖', label: 'Reading' },
  { id: 'cong-cu-tu-tap', icon: '📿', label: 'Practice Tools' },
  { id: 'phap-thoai', icon: '🎧', label: 'Dharma Talks' },
  { id: 'tai-khoan-dong-bo', icon: '☁️', label: 'Cloud Sync' },
  { id: 'huong-dan-nguoi-moi', icon: '🌱', label: 'Beginners' },
  { id: 'huong-dan-tung-kinh', icon: '📖', label: 'Sutra Chanting' },
  { id: 'huong-dan-tri-chu', icon: '📿', label: 'Mantra Recitation' },
  { id: 'tho-tuong-tai-gia', icon: '🪔', label: 'Altar Setup' },
  { id: 'thuc-hanh-hang-ngay', icon: '📋', label: 'Daily Practice' },
  { id: 'bo-thi-may-nghe-phap', icon: '📻', label: 'Dharma Giving' },
  { id: 'gioi-thieu-tac-gia', icon: '👤', label: 'Author Info' },
  { id: 'hoi-dap-thuong-gap', icon: '❓', label: 'Q & A' },
] as const;
