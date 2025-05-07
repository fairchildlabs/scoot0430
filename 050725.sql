--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: neondb_owner
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO neondb_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: neondb_owner
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: checkins; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.checkins (
    id integer NOT NULL,
    user_id integer NOT NULL,
    check_in_time timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    club_index integer DEFAULT 34 NOT NULL,
    check_in_date text NOT NULL,
    game_set_id integer DEFAULT 1 NOT NULL,
    queue_position integer DEFAULT 1 NOT NULL,
    game_id integer,
    type text DEFAULT 'manual'::text NOT NULL,
    team integer
);


ALTER TABLE public.checkins OWNER TO neondb_owner;

--
-- Name: checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.checkins_id_seq OWNER TO neondb_owner;

--
-- Name: checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.checkins_id_seq OWNED BY public.checkins.id;


--
-- Name: game_players; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.game_players (
    id integer NOT NULL,
    game_id integer NOT NULL,
    user_id integer NOT NULL,
    team integer NOT NULL,
    relative_position integer
);


ALTER TABLE public.game_players OWNER TO neondb_owner;

--
-- Name: game_players_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.game_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_players_id_seq OWNER TO neondb_owner;

--
-- Name: game_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.game_players_id_seq OWNED BY public.game_players.id;


--
-- Name: game_sets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.game_sets (
    id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by integer NOT NULL,
    players_per_team integer DEFAULT 4 NOT NULL,
    gym text DEFAULT 'fonde'::text NOT NULL,
    max_consecutive_games integer DEFAULT 2 NOT NULL,
    time_limit integer DEFAULT 15 NOT NULL,
    win_score integer DEFAULT 21 NOT NULL,
    point_system text DEFAULT '2s and 3s'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    number_of_courts integer DEFAULT 2 NOT NULL,
    current_queue_position integer DEFAULT 1 NOT NULL,
    queue_next_up integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.game_sets OWNER TO neondb_owner;

--
-- Name: game_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.game_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_sets_id_seq OWNER TO neondb_owner;

--
-- Name: game_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.game_sets_id_seq OWNED BY public.game_sets.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.games (
    id integer NOT NULL,
    set_id integer NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    team1_score integer,
    team2_score integer,
    club_index integer DEFAULT 34 NOT NULL,
    court text NOT NULL,
    state text DEFAULT 'started'::text NOT NULL
);


ALTER TABLE public.games OWNER TO neondb_owner;

--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.games_id_seq OWNER TO neondb_owner;

--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: media_attachments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.media_attachments (
    id integer NOT NULL,
    message_id integer NOT NULL,
    media_type text NOT NULL,
    media_path text NOT NULL,
    thumbnail_path text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    user_id integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.media_attachments OWNER TO neondb_owner;

--
-- Name: media_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.media_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.media_attachments_id_seq OWNER TO neondb_owner;

--
-- Name: media_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.media_attachments_id_seq OWNED BY public.media_attachments.id;


--
-- Name: message_bumps; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.message_bumps (
    id integer NOT NULL,
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now()
);


ALTER TABLE public.message_bumps OWNER TO neondb_owner;

--
-- Name: message_bumps_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.message_bumps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.message_bumps_id_seq OWNER TO neondb_owner;

--
-- Name: message_bumps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.message_bumps_id_seq OWNED BY public.message_bumps.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    user_id integer NOT NULL,
    content text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    club_index integer DEFAULT 1995 NOT NULL,
    has_media boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_by integer,
    deleted_at timestamp without time zone,
    media_id integer
);


ALTER TABLE public.messages OWNER TO neondb_owner;

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.messages_id_seq OWNER TO neondb_owner;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: moderation_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.moderation_logs (
    id integer NOT NULL,
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    action text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    notes text
);


ALTER TABLE public.moderation_logs OWNER TO neondb_owner;

--
-- Name: moderation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.moderation_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.moderation_logs_id_seq OWNER TO neondb_owner;

--
-- Name: moderation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.moderation_logs_id_seq OWNED BY public.moderation_logs.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    birth_year integer NOT NULL,
    birth_month integer,
    birth_day integer,
    is_player boolean DEFAULT true NOT NULL,
    is_bank boolean DEFAULT false NOT NULL,
    is_book boolean DEFAULT false NOT NULL,
    is_engineer boolean DEFAULT false NOT NULL,
    is_root boolean DEFAULT false NOT NULL,
    autoup boolean DEFAULT true NOT NULL,
    is_gym boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: checkins id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.checkins ALTER COLUMN id SET DEFAULT nextval('public.checkins_id_seq'::regclass);


--
-- Name: game_players id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_players ALTER COLUMN id SET DEFAULT nextval('public.game_players_id_seq'::regclass);


--
-- Name: game_sets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_sets ALTER COLUMN id SET DEFAULT nextval('public.game_sets_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: media_attachments id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.media_attachments ALTER COLUMN id SET DEFAULT nextval('public.media_attachments_id_seq'::regclass);


--
-- Name: message_bumps id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_bumps ALTER COLUMN id SET DEFAULT nextval('public.message_bumps_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: moderation_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.moderation_logs ALTER COLUMN id SET DEFAULT nextval('public.moderation_logs_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: checkins; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.checkins (id, user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, game_id, type, team) FROM stdin;
3	2	2025-05-07 08:42:32.687	f	34	2025-05-07	1	3	1	manual	1
5	21	2025-05-07 08:42:38.544	f	34	2025-05-07	1	5	1	manual	2
7	26	2025-05-07 08:42:41.578	f	34	2025-05-07	1	7	1	manual	2
14	24	2025-05-07 14:45:21.849746	f	34	2025-05-07	1	9	2	win_promoted:1:H	1
15	31	2025-05-07 14:45:21.849746	f	34	2025-05-07	1	10	2	win_promoted:1:H	1
16	2	2025-05-07 14:45:21.849746	f	34	2025-05-07	1	11	2	win_promoted:1:H	1
17	37	2025-05-07 14:45:21.849746	f	34	2025-05-07	1	12	2	win_promoted:1:H	1
10	33	2025-05-07 08:42:48.953	f	34	2025-05-07	1	14	2	manual	2
12	44	2025-05-07 08:42:53.642	f	34	2025-05-07	1	16	2	manual	2
18	21	2025-05-07 14:45:21.849746	t	34	2025-05-07	1	22	\N	autoup:1:A	2
19	25	2025-05-07 14:45:21.849746	t	34	2025-05-07	1	23	\N	autoup:1:A	2
20	26	2025-05-07 14:45:21.849746	t	34	2025-05-07	1	24	\N	autoup:1:A	2
21	14	2025-05-07 14:45:21.849746	t	34	2025-05-07	1	25	\N	autoup:1:A	2
1	24	2025-05-07 08:42:28.352	f	34	2025-05-07	1	1	1	manual	1
2	31	2025-05-07 08:42:29.801	f	34	2025-05-07	1	2	1	manual	1
4	37	2025-05-07 08:42:34.145	f	34	2025-05-07	1	4	1	manual	1
6	25	2025-05-07 08:42:40.104	f	34	2025-05-07	1	6	1	manual	2
8	14	2025-05-07 08:42:44.377	f	34	2025-05-07	1	8	1	manual	2
9	22	2025-05-07 08:42:45.799	f	34	2025-05-07	1	13	2	manual	2
11	13	2025-05-07 08:42:50.655	f	34	2025-05-07	1	15	2	manual	2
13	38	2025-05-07 08:42:59.602	t	34	2025-05-07	1	21	\N	manual	\N
22	22	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	17	\N	loss_promoted:2:A	2
23	33	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	18	\N	loss_promoted:2:A	2
24	13	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	19	\N	loss_promoted:2:A	2
25	44	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	20	\N	loss_promoted:2:A	2
26	24	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	26	\N	autoup:2:H	1
27	31	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	27	\N	autoup:2:H	1
28	37	2025-05-07 14:47:18.045797	t	34	2025-05-07	1	28	\N	autoup:2:H	1
\.


--
-- Data for Name: game_players; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_players (id, game_id, user_id, team, relative_position) FROM stdin;
1	1	24	1	1
2	1	31	1	1
3	1	2	1	1
4	1	37	1	1
5	1	21	2	1
6	1	25	2	1
7	1	26	2	1
8	1	14	2	1
9	2	24	1	1
10	2	31	1	2
11	2	2	1	3
12	2	37	1	4
13	2	22	2	1
14	2	33	2	1
15	2	13	2	1
16	2	44	2	1
\.


--
-- Data for Name: game_sets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_sets (id, created_at, created_by, players_per_team, gym, max_consecutive_games, time_limit, win_score, point_system, is_active, number_of_courts, current_queue_position, queue_next_up) FROM stdin;
1	2025-05-07 08:42:21.054	0	4	fonde	2	15	21	2s and 3s	t	2	17	29
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.games (id, set_id, start_time, end_time, team1_score, team2_score, club_index, court, state) FROM stdin;
2	1	2025-05-07 14:46:17.065885	2025-05-07 14:47:18.045797	23	2	34	1	completed
1	1	2025-05-07 14:44:13.415562	2025-05-07 14:45:21.849746	23	20	34	1	completed
\.


--
-- Data for Name: media_attachments; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.media_attachments (id, message_id, media_type, media_path, thumbnail_path, created_at, user_id) FROM stdin;
1	2	video	/uploads/9d6ae1c1-3628-449a-8bcc-8807c76235f1.mp4	/video-placeholder.png	2025-04-26 20:06:20.336	2
2	4	video	/uploads/0f625901-6c03-4b47-8d19-e66e7d35cebb.mp4	/video-placeholder.png	2025-04-26 20:07:10.333	2
3	6	video	/uploads/1c3044fc-3091-4a19-9e79-f9b28a793fcd.mp4	/video-placeholder.png	2025-05-01 19:51:42.849	2
4	8	video	/uploads/584c45de-162a-4157-bc1f-2f3ab2fdd1a9.mp4	/video-placeholder.png	2025-05-01 20:12:15.153	30
\.


--
-- Data for Name: message_bumps; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.message_bumps (id, message_id, user_id, "timestamp") FROM stdin;
1	8	30	2025-05-01 21:11:42.198048+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.messages (id, user_id, content, created_at, club_index, has_media, is_deleted, deleted_by, deleted_at, media_id) FROM stdin;
1	41	This is a test message from admin	2025-04-23 21:54:02.878529	1995	f	t	0	2025-04-26 19:50:21.386	\N
5	2	\N	2025-04-26 20:07:10.562	1995	t	t	2	2025-04-26 20:07:34.941	2
2	2	\N	2025-04-26 20:06:20.25	1995	t	t	0	2025-04-27 20:07:03.853	1
4	2	\N	2025-04-26 20:07:10.278	1995	t	t	0	2025-05-01 13:37:26.683	2
7	2	\N	2025-05-01 19:51:43.082	1995	t	t	2	2025-05-01 19:52:06.052	3
6	2	\N	2025-05-01 19:51:42.782	1995	t	t	2	2025-05-01 20:09:25.481	3
9	30	\N	2025-05-01 20:12:15.379	1995	t	t	2	2025-05-01 21:24:58.072	4
8	30	\N	2025-05-01 20:12:15.103	1995	t	t	2	2025-05-01 21:25:03.341	4
3	2	\N	2025-04-26 20:06:20.563	1995	t	f	\N	\N	1
\.


--
-- Data for Name: moderation_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.moderation_logs (id, message_id, user_id, action, "timestamp", notes) FROM stdin;
1	1	0	delete	2025-04-26 19:50:21.436	\N
2	5	2	delete	2025-04-26 20:07:34.988	\N
3	2	0	delete	2025-04-27 20:07:03.905	\N
4	3	0	delete	2025-04-27 20:07:07.709	\N
5	4	0	delete	2025-05-01 13:37:26.735	\N
6	7	2	delete	2025-05-01 19:52:06.103	\N
7	6	2	delete	2025-05-01 20:09:25.54	\N
8	9	2	delete	2025-05-01 21:24:58.12	\N
9	8	2	delete	2025-05-01 21:25:03.387	\N
10	3	0	restore	2025-05-01 21:34:30.286	\N
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.session (sid, sess, expire) FROM stdin;
YY9C6o4a0qTg1tM22QkBSsqBGwsr6-d2	{"cookie":{"originalMaxAge":604800000,"expires":"2025-05-13T15:01:20.110Z","secure":true,"httpOnly":true,"path":"/"},"passport":{"user":0}}	2025-05-14 17:02:21
U4bZvJdPvwxXk9rCMpcYCPx3y5Akbi_X	{"cookie":{"originalMaxAge":604800000,"expires":"2025-05-08T21:29:27.298Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":0}}	2025-05-14 16:07:58
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, password, first_name, last_name, email, phone, birth_year, birth_month, birth_day, is_player, is_bank, is_book, is_engineer, is_root, autoup, is_gym) FROM stdin;
9	rodney	be8275dd6b85513c8ac17b8e7d585b69fd06dbe51efc380e9be45977e40b1e71d74a3537d8bbadb061546211bd173832204a91b6e6d0e9915fa38f1cbfb50077.3583e80d163e8eab91c2257d2650985e					1966	\N	\N	t	f	f	f	f	t	f
10	pat	f065694fb4e40fa7ec82d75910cbc49d54d5a10dce3a30ba953fd49e05e5536e75b80b69c850f55f76a37257e6a9e469511171dde911e4ebb2445b9230d5a4c3.0340e71780857079866203cc83d8e18a					1966	\N	\N	t	f	f	f	f	t	f
11	sheldon	0d339a4a2245cafadf6f58140f90d0ec6e7b2c12b4923a6da0fb6212843bda7dc092b0da29f17f7aba13a5c9cf169a3f4c4cdb2c8a6a1916b8d0237ce7e3b753.3791126e359c888758d1d9dccea32e71					1964	\N	\N	t	f	f	f	f	t	f
5	fonde	617702dddd8003c4bee058364edaccb7e07cade92e7541acc5a1724d4d04a8b50b5c7be57e435ca620b03723007cbf6e52c70a53b53cc11e79f1cf7fdfb0456d.08a32d8e5db4acfce060e84f14fffbcb					2025	\N	\N	f	f	f	f	f	t	t
6	kevin	3b9ae1a659aa313aaf48a601599cf9f10e3f1e4c0fcf84a6ca6d5f69bc45aa7b71f5404039cfd28e9106436a8ec1d981dfcf5504062234588554d2e8f113073c.3df54a72ae2c45abd0d7bf595f6b8831					1963	\N	\N	t	f	f	f	f	t	f
12	myron	228a5f52beab0f526709a7bebf9cf5df4ce507c1b7f9ec5e5fb002106c72e326a6fb461548b80677b76d5cb9e7036199b51deea3ba2f8935f31961583717d5e8.9cb948f2df229af5561de5ba4460d082					1969	\N	\N	t	f	f	f	f	t	f
7	kennyg	633045ca7d6e1120e9ba4021c15a3d0b26cb60fab998a791b760aeb13fb6e09131483bdd82e1eae9060365671fa78103aab51c2f20c101391f747603a4002fa9.1acbc384d18e3cb32253eb0e24d29806					1961	\N	\N	t	f	f	f	f	t	f
8	nick	615ceb307031e673421db580527b741fec0e1618aa69839e726e5aa252e2392d2329611db2dee11fb4f11558e4767e52dfb175fad8ba25916dbf693e28705945.074f262f58c1ef349d524d9275014e96					1970	\N	\N	t	f	f	f	f	t	f
13	frank	3708a65abab745a3edb8e0978306901fef1fe0765bb24a6798d4bfa8c1eb6f71a2d7485cd475e0064634fd61df158a48799b2ec16c8d3dc0f2aa2317b91cfcff.f6011ff7c2d734862216acbf56ff39e4					1945	\N	\N	t	f	f	f	f	t	f
14	coach	93375db31b417d3eceffefbac1040830dd64ee0b76919684c330a2f535c4015415c1937b4bd8b6493cb8d46d838f3be37f609f8ee0b049cdd3475a41f6d2458e.1fbdb94643cf9d8f16488684649ffd9a					1961	\N	\N	t	f	f	f	f	t	f
15	kiwi	d5b2919715b88836ec8ae630ce89e9c317f94c571b514c2f729599418afae897a5379f6eaca0a143d39d76bd11a66af0e28f1458dc32679bc879e900af5918a0.3a892f4f0d9132529f708394186d5784					1963	\N	\N	t	f	f	f	f	t	f
16	derrick	6b6e59774101f5a125ca0d2706d509e18dfda910119b7369531b2607cb3ddce4adcb555be701e16ef842f8dd3d98688eec3a1e3bb31fcd6f846bbcca499df1f1.efe34ed81b5618360205c35136bcc323					1975	\N	\N	t	f	f	f	f	t	f
18	tim	5a21323f1be00b32fbcbe52de3e2dd3faf67aeb7a068f5c7f03235407a7e1ea18387e8a3d53923b7e4d79000ebb755ca06fbf8659cef69152a3926099765035c.5a27348b21e82cc11196976739e62d88					1957	\N	\N	t	f	f	f	f	t	f
17	mark	ec0ef264a45532d1c14673fa56fb7070fa92c5449157c2b559172393b724dbac6738e02e523f7c964a2b8021d30d1dccdbff2a014b3f098ec534b35a460bec7b.c17240fe1b643264840b9690d6be7a53					1958	\N	\N	t	f	f	f	f	t	f
19	medina	9f27e8fd340c499bbc805573a05d5b74d0bf4ca1e7faf0e5bafcafbd03912837c6b1d3bdfbc9f80a78636299ea079c53d13140135885f5e8ed272b6a5125fcce.3e1892b7261bfb3ea361646383f9f2f1					1954	\N	\N	t	f	f	f	f	t	f
20	kt	00104c5075b1f74cff45c37167a87325edabf3f2ba2c8a36c673cbf8721538c8571cbb9f89d73e35e7baa4a984fc69ced0a0761e02da5ebc3f86edfb0ad47bad.cf479aee0e94a58ea11e78ff71e0a67b					1964	\N	\N	t	f	f	f	f	t	f
21	charles	d807c3d7396d5e06c677d4a0a7bc2a2bb50794bcc4c51836899289c28fabd6f4a103ebff7ff6249834680e339e369d61be8d85e811c5a11ebb0399cc385c30f2.26e9c67ec78a7d8d34704e4acf4f1ac0					1971	\N	\N	t	f	f	f	f	t	f
22	darrell	5fe64363a47910d9bf9527972261e968185bf6299ee8ac4b60684dd764c40b8c8d693aa59703223f14b9f5b42c49ee90b386bd80f44af59d7ff3cf3b028a015c.f9fb4e85e365518e461d04a9bdd9aa6e					1966	\N	\N	t	f	f	f	f	t	f
23	ray	ba0a65f21ece753759082ca57e623d7c337f7e572f6f26f0c0c7bae956ce4ce526a6a1f42cd2c7abaabc53a186a5fabc0074aaaa5b14e16d48973b3ea1006605.c573de5528b945a1beedfc3591d8e411					1954	\N	\N	t	f	f	f	f	t	f
24	anthony	5002c3ed9948eb045ce44abb4d67b60dc2d170bdb2a123f0643fb5c6994cb13feeb14bbb7c821386ab65dc9cbdd50f9cb6b51563c31df3416c760b96717d5215.466ac9adde366a9ac1baadf0252fe50b					1954	\N	\N	t	f	f	f	f	t	f
25	chef	2a620acaa3729512dd059b67f351ce159e66c18d6827d7a12144dbe926822db7188246498b90f2d6ae92ecc6b7aa84540330cd47d13c4f00ed3c7c1172285bc3.11c3cf7db1a187b68badf4b3a7504b5c					1960	\N	\N	t	f	f	f	f	t	f
26	cleo	f1a0c769a73ceec99356353f579a4f441d93c9360a56c17afa694dd1c3d579f794e8c0d31e42830b4a29e806eeb7e61792462dfabe2cfb9be4ad270478d6a73c.4faf3531694f18f405580bc8486b8320					1946	\N	\N	t	f	f	f	f	t	f
27	ron	5d7d7bee248b312eeb57941195e9d061cd71b704552b3c4a49e248efaa4bc66d5f94c89d671c538fb08b0febb0bd8f6ee9bcf5ea823d373d9505c631c4fa64ab.ecdd3982724828b96ad1ebf5bdc4ca37					1965	\N	\N	t	f	f	f	f	t	f
28	mcghee	406b21015f3ab79fedc3b1c5b1aeab4cc056fdadba72fbbf7c4da2170f9f98ab65ba7eb82de9b5154837c915ce24bb92986e8426f56067ca44af9222dff4c71a.24728ef46aee79a29cacfc7a2b2d97d2					1944	\N	\N	t	f	f	f	f	t	f
29	zelle	f2cb6ca5102b0518c583668e2e55fdbf030ae27c5de61f545c4032a42c94bdaa4e1d3fbf36b411fe2ae653b0a918e13d3d1ba7095cd67a936f50ab4f25a8dd00.ed2dc33ff6c2588a14d3ed96f4e8cf13					1965	\N	\N	t	f	f	f	f	t	f
30	mp3	c64ed8ee94c12a24d3f4beafdc860c9f3f8f4dc03a932fcfb0bbe9f9dd4f241dda558e7e56acfe98af052690aea7e720790d0a4e2cd0a91a82b0d32d7d4f1d5c.b62c2b14aa9fcc2157de5f32f0d543fa					2023	\N	\N	t	f	f	f	f	t	f
31	bo	d224764a7b31f275c0ca7a8fc5b71cc5d993c3be242b0461d8efd216547f1257d3584731d70074c2d7f3b7186c69d05e838e0f83e8a33334339f02e05a73f1ec.627359f45705678dad85e1e285f61e7a					2025	\N	\N	t	f	f	f	f	t	f
32	kirk	f0fbc3ddce856bbffed080cce164e2cce204ad8f6fb626cde15ec4cf38358d7538fbad2fc0f6ec012af4ef2472706bf73467392013a11000b98b686919dbeb93.15efcfcc60ab062fc69ef8f7e506480a					2025	\N	\N	t	f	f	f	f	t	f
33	donnie	f1b3ee0650f07360cc1c6d009777734f9cc83475cec397874b87a8b1d0223be247e48ddff6efb6bf815103dfa0ac812edd2265db113006935a1d45662db3cb1d.6a5c1b62f1af5888bfc95e9de0f2004f					2025	\N	\N	t	f	f	f	f	t	f
34	hal	e519ac429cfe123dba0d8f74d53df6ea0cc8f02ba4d44f11b150aec4603812564126fcfaa5d5319103e5a41b8ff7ef0276e2db0ae3cb3c18cffe2e5f7363f9d0.e921a875e568abae93b475389e943014					1940	\N	\N	t	f	f	f	f	t	f
0	scuzzydude	e6f2039944019b823f9e43d07588a567dbf071ad95e7b476db40308496bb0ebc00a454a2d2d08007fd9f72667b56297b5a427777c3085668770089e2add4617b.541ebb7e821a394e821be3ed5b1e5141					1970	\N	\N	f	f	f	t	t	t	t
35	anthonyr	8b09d6430489b62b3efd0568b6ba36f381eec8aa4aa0832144133fd1681e372707a0e618b72b6af3479cafbe7fa5bbfbac5edb154ae37c6d0ba70d0e374e7bfc.cde3d1f03e5a3d59bb4bd8a2a3139a24					2025	\N	\N	t	f	f	f	f	t	f
36	bo1	39a4447cb1b7e99b5e3b4f737a51cb5d1dfc76fbfbf11335c2cdd39a56fe0f9003e2f0d1361188975f974ca1b926302c2fb947aaf984f903b54e4c09425955b9.854d4b15170902cebc68fa0e50158c2e					2025	\N	\N	t	f	f	f	f	t	f
37	butch	0ceeb885f6f90f416dcfd41b854ce872793326d502c5e3dfcd1d166ae9937706d1251a8d04aa0711b02a78763048651fd56ca5688dcf0d9a8d3ee9b7af9239f3.90d70d75971ca0b1e2bf4041b7b8fd1a					2025	\N	\N	t	f	f	f	f	t	f
38	jerry	43354a43392605bfdd43de3d9355d93bea38f315a7e3a232ee1dec9c48ef723a84454e97a4663828fea31dde2f6b8d8211c5491c632e733310f279e3947439e2.84b80544eb3d87376af4800b5d8dfee1					2025	\N	\N	t	f	f	f	f	t	f
39	michael	16049503dcbf38f420b4d4566bfbb71c8b19a9f63e9a548f697ae4502d9da2390582d49de8667d73972815050811a3dbbdf8ad2be3e7f849e1877c3d1425cfc2.d54ccd881bac8410d05a36449055c2ba					2025	\N	\N	t	f	f	f	f	t	f
40	john	880d23c4b73eb084bb567e9fa9e08cc4993b8ee0b02f0acebd2ea73e0a518bf4524635385cefed588d02d052a7f7e47afef3616feef1a4d71264dde8d6f2dc4c.6c5095d3eeb3c14633e4262b4b3c7155					2025	\N	\N	t	f	f	f	f	t	f
42	rufus	04fc9d6400b8c7e27749da116b81a18352e1ee838e38593e3e6c01963e9f61df6f763728b4458f74407c044bd1bcb2193ab79490a163244fd62c2b12f471fc45.c6d61e322702546fdd6eb6d0bb857d0c					2025	\N	\N	t	f	f	f	f	t	f
43	shipp	ac188041b27d7c87f1cb8b2287369f526582a67bf951e6bc06b8b18e6ebb9d86b529e76ecdefdbd50ebf164926448412dd68784f6649db5bcdb7457968ece695.97ea82268e07cf8076fe61bcce106d9c					2025	\N	\N	t	f	f	f	f	t	f
44	jen	6567407acc37fb8c23e513dff2e80fe5398dcb0a4c4b89851ab17f3c7fc79332bd8a4134d98f6ef1e0056e9b939427910813c6a1b9f988ca049127332ac98bf9.fb09fb568fe0a2ea39d960b9a8e29cb2					2025	\N	\N	t	f	f	f	f	t	f
45	testuser	86bba003d58faec8788d052f8f093b96b8f9df0e9404434a4ffe66f0bf7412d1e474df34b100b99c1ab390be5479724b3de0d885fea843cfc10bd0cd7ef1b91e.4ff3e6ed6eb2d50c33e21b6709cbd4d2	Test	User	test@example.com	\N	1990	\N	\N	t	f	f	t	f	t	f
3	jack	3868ec6eab4295788b9a98f39831cbe83a154c1a0ed3cf17e04270e9bba506a3cd1e307cc77c82688608d3e7a95d67eae44ef54743fccfb739b8af23d336112a.7512db789cdb0b7cdc788a78f880a8b4	Jack	Awbrey	mebighappyskull@gmail.com		2009	1	16	f	f	f	t	f	t	f
4	hakeem	1f04b5acc1449edd6b879a129009ec7784c22e0287770460b288a19f02d9b3b6b575ca2b33a7e42be7f3132d049523c6b0ca328e1b6d4792d154eaddac4951b3.8ac5b763257a6edd04c72577e98ed08e	Hakeem	Awbrey	hakeemawbrey@gmail.com		1998	4	30	f	f	f	t	f	t	f
41	admin	$2b$10$RgxQ5/sLvVhtGkf8ODG40Oes0MFZiX2Bv9CM2aZZUJq4s7VGpVGEW	\N	\N	\N	\N	1980	\N	\N	f	f	f	t	t	t	f
2	brandon	f04d3be632567cea2597aaf87155e3ca92cdf0547d0f3ddd8b0ae9e5d339c4ce315ca4553831bffa6f843fc93a234f75a7d9a03025ace42726f54d9c236f3b67.34fff66f5ebdd1ea60e2ebc143b388d7	Brandon	Awbrey	scuzzydude@hotmail.com	7133055620	1970	11	17	t	t	t	t	f	f	f
\.


--
-- Name: checkins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.checkins_id_seq', 28, true);


--
-- Name: game_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_players_id_seq', 16, true);


--
-- Name: game_sets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_sets_id_seq', 1, true);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.games_id_seq', 2, true);


--
-- Name: media_attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.media_attachments_id_seq', 4, true);


--
-- Name: message_bumps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.message_bumps_id_seq', 1, true);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.messages_id_seq', 9, true);


--
-- Name: moderation_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.moderation_logs_id_seq', 10, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 45, true);


--
-- Name: checkins checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_pkey PRIMARY KEY (id);


--
-- Name: game_players game_players_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_pkey PRIMARY KEY (id);


--
-- Name: game_sets game_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_sets
    ADD CONSTRAINT game_sets_pkey PRIMARY KEY (id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: media_attachments media_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.media_attachments
    ADD CONSTRAINT media_attachments_pkey PRIMARY KEY (id);


--
-- Name: message_bumps message_bumps_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_bumps
    ADD CONSTRAINT message_bumps_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_bumps message_bumps_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_bumps
    ADD CONSTRAINT message_bumps_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: moderation_logs moderation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.moderation_logs
    ADD CONSTRAINT moderation_logs_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_session_expire ON public.session USING btree (expire);


--
-- Name: media_attachments fk_media_attachments_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.media_attachments
    ADD CONSTRAINT fk_media_attachments_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: messages fk_messages_media; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT fk_messages_media FOREIGN KEY (media_id) REFERENCES public.media_attachments(id);


--
-- Name: media_attachments media_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.media_attachments
    ADD CONSTRAINT media_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: messages messages_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: messages messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: moderation_logs moderation_logs_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.moderation_logs
    ADD CONSTRAINT moderation_logs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: moderation_logs moderation_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.moderation_logs
    ADD CONSTRAINT moderation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: neondb_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

