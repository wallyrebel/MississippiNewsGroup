// The Mississippi News Group network.
// `kind` is "news" or "sports"; `area` matches an id in AREAS below.
const SITES = [
  {
    "name": "Alcorn County News",
    "home": "https://alcornnewsms.com",
    "feed": "https://alcornnewsms.com/feed/",
    "kind": "news",
    "area": "alcorn",
    "blurb": "News from Corinth and Alcorn County"
  },
  {
    "name": "Alcorn County Sports",
    "home": "https://alcornsportsms.com",
    "feed": "https://alcornsportsms.com/feed/",
    "kind": "sports",
    "area": "alcorn",
    "blurb": "Sports coverage from Corinth and Alcorn County"
  },
  {
    "name": "Benton County Sports",
    "home": "https://bentonsportsms.com",
    "feed": "https://bentonsportsms.com/feed/",
    "kind": "sports",
    "area": "benton",
    "blurb": "Sports coverage from Ashland and Benton County"
  },
  {
    "name": "Mississippi Delta Report",
    "home": "https://mississippideltareport.com",
    "feed": "https://mississippideltareport.com/feed/",
    "kind": "news",
    "area": "delta",
    "blurb": "News from across the Mississippi Delta"
  },
  {
    "name": "DeSoto County News",
    "home": "https://desotocountynews.com",
    "feed": "https://desotocountynews.com/feed/",
    "kind": "news",
    "area": "desoto",
    "blurb": "News from Southaven, Olive Branch, Hernando and Horn Lake"
  },
  {
    "name": "Lee County Sports",
    "home": "https://leesportsms.com",
    "feed": "https://leesportsms.com/feed/",
    "kind": "sports",
    "area": "lee",
    "blurb": "Sports coverage from Tupelo and Lee County"
  },
  {
    "name": "Mississippi News",
    "home": "https://msnewsgroup.com",
    "feed": "https://msnewsgroup.com/feed/",
    "kind": "news",
    "area": "statewide",
    "blurb": "Statewide Mississippi news"
  },
  {
    "name": "Oxford News",
    "home": "https://oxfordmsnews.com",
    "feed": "https://oxfordmsnews.com/feed/",
    "kind": "news",
    "area": "oxford",
    "blurb": "News from Oxford and Lafayette County"
  },
  {
    "name": "Pontotoc News",
    "home": "https://pontotocnews.com",
    "feed": "https://pontotocnews.com/feed/",
    "kind": "news",
    "area": "pontotoc",
    "blurb": "News from Pontotoc and Pontotoc County"
  },
  {
    "name": "Prentiss County News",
    "home": "https://prentissnews.com",
    "feed": "https://prentissnews.com/feed/",
    "kind": "news",
    "area": "prentiss",
    "blurb": "News from Booneville and Prentiss County"
  },
  {
    "name": "Prentiss County Sports",
    "home": "https://prentisssportsms.com",
    "feed": "https://prentisssportsms.com/feed/",
    "kind": "sports",
    "area": "prentiss",
    "blurb": "Sports coverage from Booneville and Prentiss County"
  },
  {
    "name": "Mississippi Sports",
    "home": "https://sportsmississippi.com",
    "feed": "https://sportsmississippi.com/feed/",
    "kind": "sports",
    "area": "statewide",
    "blurb": "Statewide Mississippi sports"
  },
  {
    "name": "Tippah County News",
    "home": "https://tippahnews.com",
    "feed": "https://tippahnews.com/feed/",
    "kind": "news",
    "area": "tippah",
    "blurb": "News from Ripley and Tippah County"
  },
  {
    "name": "Tippah County Sports",
    "home": "https://tippahsports.com",
    "feed": "https://tippahsports.com/feed/",
    "kind": "sports",
    "area": "tippah",
    "blurb": "Sports coverage from Ripley and Tippah County"
  },
  {
    "name": "Tupelo News",
    "home": "https://newstupelo.com",
    "feed": "https://newstupelo.com/feed/",
    "kind": "news",
    "area": "lee",
    "blurb": "News from Tupelo and Lee County"
  },
  {
    "name": "Union County News",
    "home": "https://unionnewsms.com",
    "feed": "https://unionnewsms.com/feed/",
    "kind": "news",
    "area": "union",
    "blurb": "News from New Albany and Union County"
  },
  {
    "name": "Union County Sports",
    "home": "https://unionsportsms.com",
    "feed": "https://unionsportsms.com/feed/",
    "kind": "sports",
    "area": "union",
    "blurb": "Sports coverage from New Albany and Union County"
  }
];

// Communities readers can filter the front page by.
const AREAS = [
  { "id": "statewide", "label": "Statewide" },
  { "id": "alcorn", "label": "Alcorn County" },
  { "id": "benton", "label": "Benton County" },
  { "id": "delta", "label": "The Delta" },
  { "id": "desoto", "label": "DeSoto County" },
  { "id": "lee", "label": "Tupelo & Lee County" },
  { "id": "oxford", "label": "Oxford" },
  { "id": "pontotoc", "label": "Pontotoc" },
  { "id": "prentiss", "label": "Prentiss County" },
  { "id": "tippah", "label": "Tippah County" },
  { "id": "union", "label": "Union County" }
];

export { SITES, AREAS };
