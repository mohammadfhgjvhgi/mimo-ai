# Z.AI Environment Integration Plan

> DO NOT execute `curl -sS https://z-cdn.chatglm.cn/fullstack/init-fullstack.sh | bash`
> The project is ALREADY initialized. Running the script would DESTROY existing work.

---

## Current Environment Status

### Already Present (VERIFIED)
| Component | Location | Status |
|-----------|----------|--------|
| Next.js 16.1.3 | package.json | ✅ Installed |
| TypeScript 5 | package.json | ✅ Installed |
| Tailwind CSS 4 | package.json | ✅ Installed |
| shadcn/ui (New York) | src/components/ui/ | ✅ 48 components |
| Prisma 6.11 | package.json | ✅ Installed |
| SQLite | db/custom.db | ✅ Active |
| z-ai-web-dev-sdk v0.0.18 | package.json | ✅ Installed |
| Caddyfile | /Caddyfile | ✅ Configured (XTransformPort) |
| .zscripts/ | /.zscripts/ | ✅ Build/dev/start scripts |
| skills/ | /skills/ | ✅ 69 skills including UI/UX Pro Max |
| examples/websocket/ | /examples/websocket/ | ✅ Socket.io reference |
| mini-services/ | /mini-services/ | ✅ Empty but configured |
| Bun runtime | system | ✅ Installed |

### What init-fullstack.sh Would Do (DESTRUCTIVE)
1. **Overwrite Caddyfile** — would reset gateway config
2. **Replace .zscripts/** — would reset build scripts
3. **Reinstall skills** — would overwrite skill configurations
4. **Reset package.json** — would lose custom dependencies
5. **Overwrite next.config.ts** — would lose `ignoreBuildErrors` setting (and other config)
6. **Reset Prisma** — would lose database schema and data

### Decision: DO NOT RUN init-fullstack.sh

The project is already a Z.ai fullstack environment. All necessary components are present. Running the init script provides no benefit and risks destroying:
- 12 Prisma models
- 15 agents
- 10 tools
- 69 skills
- All conversations, memories, artifacts in the database
- All custom configuration

---

## Environment Capabilities

### Available
| Capability | Provider | How to Use |
|-----------|----------|-----------|
| LLM chat | z-ai-web-dev-sdk | `import ZAI from 'z-ai-web-dev-sdk'` |
| Web search | z-ai-web-dev-sdk | `zai.functions.invoke('web_search', { query })` |
| Web reader | z-ai-web-dev-sdk | `zai.functions.invoke('web_reader', { url })` |
| Image generation | z-ai-web-dev-sdk | `zai.functions.invoke('image_generation', { ... })` |
| VLM (vision) | z-ai-web-dev-sdk | `zai.functions.invoke('vlm', { ... })` |
| ASR (speech-to-text) | z-ai-web-dev-sdk | `zai.functions.invoke('asr', { ... })` |
| TTS (text-to-speech) | z-ai-web-dev-sdk | `zai.functions.invoke('tts', { ... })` |
| Skills | /skills/ directory | 69 skills auto-loaded |
| WebSocket | examples/websocket/ | Socket.io reference |
| Gateway | Caddyfile | XTransformPort for mini-services |
| Mini-services | /mini-services/ | Independent bun projects |

### Missing
| Capability | Impact | Solution |
|-----------|--------|---------|
| Function calling API | Tools unreachable | Use two-phase model call (P1-1) |
| Real streaming | Fake streaming (word-burst) | SDK v0.0.18 doesn't support it; use workaround |
| Process management | No build/test/run | Implement RuntimeService (P3-1) |
| File watching | No live reload | Add chokidar or similar (future) |

---

## SDK Version Considerations

### Current: z-ai-web-dev-sdk v0.0.18

### Known Limitations
1. **No function-calling API** — cannot define tools for the model to call natively
2. **Streaming returns empty chunks** — `stream: true` returns 1 chunk with empty content
3. **No model selection** — only GLM-4-plus available
4. **No token counting** — usage reported but not pre-call estimatable

### Workarounds in Current Code
1. **Streaming**: Non-streaming call + word-burst chunking (`model.ts:126-169`)
2. **Tool calling**: Regex-based detection (`runtime.ts:36-62` — BROKEN, to be replaced in P1-1)
3. **Structured output**: JSON parsing with fallback extraction (`model.ts:generateStructured`)

### Future SDK Upgrades
- If SDK adds function-calling: Replace two-phase approach with native calls
- If SDK fixes streaming: Remove word-burst workaround
- If SDK adds model selection: Add model registry + routing

---

## Mini-Services Integration

### Current State
- `/mini-services/` directory exists but is empty
- `.zscripts/mini-services-build.sh`, `mini-services-install.sh`, `mini-services-start.sh` exist
- Caddyfile configured with XTransformPort for mini-service routing

### Future Mini-Services (P3+)
| Service | Port | Purpose |
|---------|------|---------|
| AI Service | 3003 | Socket.io for real-time AI streaming |
| IoT Bridge | 3004 | MQTT broker for Arduino/ESP32 |
| Build Service | 3005 | Process management for project builds |

### Mini-Service Rules (from project conventions)
- Must be independent bun project with own package.json
- Must define `index.ts` as entry file
- Must define specific port (not PORT env)
- Must support auto-restart (`bun --hot`)
- Frontend requests use `?XTransformPort={Port}`

---

## Safe Integration Checklist

If any future integration is needed with Z.ai environment:

- [ ] Verify component is NOT already present
- [ ] Inspect what the installation would overwrite
- [ ] Back up existing configuration
- [ ] Test installation in isolated environment
- [ ] Verify no existing files are modified
- [ ] Run full test suite after integration
- [ ] Document what was added and why

**NEVER** run an initialization script over an existing working project without full backup and verification.
