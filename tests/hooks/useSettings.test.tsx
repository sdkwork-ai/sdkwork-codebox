// WORKSPACE-PATH:allow-fixture: fixtures name a foreign checkout root, drive, or home directory to exercise path handling, so the literal is the value under assertion rather than a binding this build resolves
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSettings } from "@/hooks/useSettings";
import type { Settings } from "@/types";

const mutateAsyncMock = vi.fn();
const useSettingsQueryMock = vi.fn();
const setAppConfigDirOverrideMock = vi.fn();
const applyClaudePluginConfigMock = vi.fn();
const applyClaudeOnboardingSkipMock = vi.fn();
const clearClaudeOnboardingSkipMock = vi.fn();
const setTrayVisibilityMock = vi.fn();
const syncCurrentProvidersLiveMock = vi.fn();
const updateTrayMenuMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

let settingsFormMock: any;
let directorySettingsMock: any;
let metadataMock: any;
let serverSettings: Settings;

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/hooks/useSettingsForm", () => ({
  useSettingsForm: () => settingsFormMock,
}));

vi.mock("@/hooks/useDirectorySettings", () => ({
  useDirectorySettings: () => directorySettingsMock,
}));

vi.mock("@/hooks/useSettingsMetadata", () => ({
  useSettingsMetadata: () => metadataMock,
}));

vi.mock("@/lib/query", () => ({
  useSettingsQuery: (...args: unknown[]) => useSettingsQueryMock(...args),
  useSaveSettingsMutation: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@/lib/api", () => ({
  settingsApi: {
    setAppConfigDirOverride: (...args: unknown[]) =>
      setAppConfigDirOverrideMock(...args),
    applyClaudePluginConfig: (...args: unknown[]) =>
      applyClaudePluginConfigMock(...args),
    applyClaudeOnboardingSkip: (...args: unknown[]) =>
      applyClaudeOnboardingSkipMock(...args),
    clearClaudeOnboardingSkip: (...args: unknown[]) =>
      clearClaudeOnboardingSkipMock(...args),
    setTrayVisibility: (...args: unknown[]) => setTrayVisibilityMock(...args),
  },
  providersApi: {
    updateTrayMenu: (...args: unknown[]) => updateTrayMenuMock(...args),
  },
}));

vi.mock("@/lib/api/postChangeSync", () => ({
  syncCurrentProvidersLiveSafe: (...args: unknown[]) =>
    syncCurrentProvidersLiveMock(...args),
}));

const createSettingsFormMock = (overrides: Record<string, unknown> = {}) => ({
  settings: {
    showInTray: true,
    minimizeToTrayOnClose: true,
    enableClaudePluginIntegration: false,
    autoSyncConfirmed: true,
    skipClaudeOnboarding: true,
    claudeConfigDir: "/claude",
    codexConfigDir: "/codex",
    openclawConfigDir: "/openclaw",
    currentProviderOpencode: "opencode-primary",
    currentProviderOpenclaw: "openclaw-primary",
    language: "zh",
    themeMode: "dark",
    themePalette: "tech-blue",
    uiDensity: "comfortable",
    motionPreference: "system",
  },
  isLoading: false,
  initialLanguage: "zh",
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
  syncLanguage: vi.fn(),
  ...overrides,
});

const createDirectorySettingsMock = (
  overrides: Record<string, unknown> = {},
) => ({
  appConfigDir: undefined,
  resolvedDirs: {
    appConfig: "/home/mock/.sdkwork/codebox",
    claude: "/default/claude",
    codex: "/default/codex",
    gemini: "/default/gemini",
    opencode: "/default/opencode",
    openclaw: "/default/openclaw",
  },
  isLoading: false,
  initialAppConfigDir: undefined,
  updateDirectory: vi.fn(),
  updateAppConfigDir: vi.fn(),
  browseDirectory: vi.fn(),
  browseAppConfigDir: vi.fn(),
  resetDirectory: vi.fn(),
  resetAppConfigDir: vi.fn(),
  resetAllDirectories: vi.fn(),
  ...overrides,
});

const createMetadataMock = (overrides: Record<string, unknown> = {}) => ({
  isPortable: false,
  requiresRestart: false,
  isLoading: false,
  acknowledgeRestart: vi.fn(),
  setRequiresRestart: vi.fn(),
  ...overrides,
});

describe("useSettings hook", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    useSettingsQueryMock.mockReset();
    setAppConfigDirOverrideMock.mockReset();
    applyClaudePluginConfigMock.mockReset();
    applyClaudeOnboardingSkipMock.mockReset();
    clearClaudeOnboardingSkipMock.mockReset();
    setTrayVisibilityMock.mockReset();
    syncCurrentProvidersLiveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    window.localStorage.clear();

    serverSettings = {
      showInTray: true,
      minimizeToTrayOnClose: true,
      enableClaudePluginIntegration: false,
      autoSyncConfirmed: true,
      skipClaudeOnboarding: true,
      claudeConfigDir: "/server/claude",
      codexConfigDir: "/server/codex",
      openclawConfigDir: "/server/openclaw",
      currentProviderOpencode: "opencode-primary",
      currentProviderOpenclaw: "openclaw-primary",
      language: "zh",
      themeMode: "dark",
      themePalette: "tech-blue",
      uiDensity: "comfortable",
      motionPreference: "system",
    };

    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        language: "zh",
        openclawConfigDir: "/server/openclaw",
      },
    });
    directorySettingsMock = createDirectorySettingsMock();
    metadataMock = createMetadataMock();

    mutateAsyncMock.mockResolvedValue(true);
    setAppConfigDirOverrideMock.mockResolvedValue(true);
    applyClaudePluginConfigMock.mockResolvedValue(true);
    applyClaudeOnboardingSkipMock.mockResolvedValue(true);
    clearClaudeOnboardingSkipMock.mockResolvedValue(true);
    setTrayVisibilityMock.mockResolvedValue(true);
    syncCurrentProvidersLiveMock.mockResolvedValue({ ok: true });
  });

  it("auto-saves and applies Claude onboarding skip when toggled on", async () => {
    serverSettings = {
      ...serverSettings,
      skipClaudeOnboarding: false,
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        language: "zh",
        skipClaudeOnboarding: false,
        themePalette: "green-tech",
      },
    });

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await result.current.autoSaveSettings({ skipClaudeOnboarding: true });
    });

    expect(applyClaudeOnboardingSkipMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("auto-saves and clears Claude onboarding skip when toggled off", async () => {
    serverSettings = {
      ...serverSettings,
      skipClaudeOnboarding: true,
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        language: "zh",
        skipClaudeOnboarding: true,
        motionPreference: "reduced",
      },
    });

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await result.current.autoSaveSettings({ skipClaudeOnboarding: false });
    });

    expect(clearClaudeOnboardingSkipMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("auto-saves and applies Claude plugin integration immediately", async () => {
    serverSettings = {
      ...serverSettings,
      enableClaudePluginIntegration: false,
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        enableClaudePluginIntegration: false,
      },
    });

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await result.current.autoSaveSettings({
        enableClaudePluginIntegration: true,
      });
    });

    expect(applyClaudePluginConfigMock).toHaveBeenCalledWith({
      official: false,
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("auto-saves tray visibility changes and clears tray-only flags", async () => {
    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        showInTray: true,
        minimizeToTrayOnClose: true,
        silentStartup: true,
      },
    });

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await result.current.autoSaveSettings({
        showInTray: false,
        minimizeToTrayOnClose: true,
        silentStartup: true,
      });
    });

    const payload = mutateAsyncMock.mock.calls.at(-1)?.[0] as Settings;
    expect(payload.showInTray).toBe(false);
    expect(payload.minimizeToTrayOnClose).toBe(false);
    expect(payload.silentStartup).toBe(false);
    expect(setTrayVisibilityMock).toHaveBeenCalledWith(false);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("saves settings and flags restart when app config directory changes", async () => {
    serverSettings = {
      ...serverSettings,
      enableClaudePluginIntegration: false,
      claudeConfigDir: "/server/claude",
      codexConfigDir: undefined,
      language: "en",
      themeMode: "light",
      themePalette: "zinc",
      uiDensity: "compact",
      motionPreference: "reduced",
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        claudeConfigDir: "  /custom/claude  ",
        codexConfigDir: "   ",
        openclawConfigDir: "  /custom/openclaw  ",
        language: "en",
        enableClaudePluginIntegration: true, // 状态从 false 变为 true
        themeMode: "light",
        themePalette: "zinc",
        uiDensity: "compact",
        motionPreference: "reduced",
      },
      initialLanguage: "en",
    });

    directorySettingsMock = createDirectorySettingsMock({
      appConfigDir: "  /override/app  ",
      initialAppConfigDir: "/previous/app",
    });

    const { result } = renderHook(() => useSettings());

    let saveResult: { requiresRestart: boolean } | null = null;
    await act(async () => {
      saveResult = await result.current.saveSettings();
    });

    expect(saveResult).toEqual({ requiresRestart: true });
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const payload = mutateAsyncMock.mock.calls[0][0] as Settings;
    expect(payload.claudeConfigDir).toBe("/custom/claude");
    expect(payload.codexConfigDir).toBeUndefined();
    expect(payload.openclawConfigDir).toBe("/custom/openclaw");
    expect(payload.autoSyncConfirmed).toBe(true);
    expect(payload.currentProviderOpencode).toBe("opencode-primary");
    expect(payload.currentProviderOpenclaw).toBe("openclaw-primary");
    expect(payload.language).toBe("en");
    expect(payload.themeMode).toBe("light");
    expect(payload.themePalette).toBe("zinc");
    expect(payload.uiDensity).toBe("compact");
    expect(payload.motionPreference).toBe("reduced");
    expect(setAppConfigDirOverrideMock).toHaveBeenCalledWith("/override/app");
    // 状态改变，应该调用 API
    expect(applyClaudePluginConfigMock).toHaveBeenCalledWith({
      official: false,
    });
    expect(metadataMock.setRequiresRestart).toHaveBeenCalledWith(true);
    expect(window.localStorage.getItem("language")).toBe("en");
    expect(toastErrorMock).not.toHaveBeenCalled();
    // 目录有变化，应触发一次同步当前供应商到 live
    expect(syncCurrentProvidersLiveMock).toHaveBeenCalledTimes(1);
  });

  it("saves settings without restart when directory unchanged", async () => {
    // 确保服务器和本地状态一致，不触发 API 调用
    serverSettings = {
      ...serverSettings,
      enableClaudePluginIntegration: false,
      launchOnStartup: false,
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        enableClaudePluginIntegration: false, // 状态未变
        launchOnStartup: false, // 状态未变
        language: "zh",
      },
      initialLanguage: "zh",
    });

    directorySettingsMock = createDirectorySettingsMock({
      appConfigDir: undefined,
      initialAppConfigDir: undefined,
    });

    const { result } = renderHook(() => useSettings());

    let saveResult: { requiresRestart: boolean } | null = null;
    await act(async () => {
      saveResult = await result.current.saveSettings();
    });

    expect(saveResult).toEqual({ requiresRestart: false });
    expect(setAppConfigDirOverrideMock).toHaveBeenCalledWith(null);
    // 状态未改变，不应调用 API
    expect(applyClaudePluginConfigMock).not.toHaveBeenCalled();
    expect(metadataMock.setRequiresRestart).toHaveBeenCalledWith(false);
    // 目录未变化，不应触发同步
    expect(syncCurrentProvidersLiveMock).not.toHaveBeenCalled();
  });

  it("shows toast when Claude plugin sync fails but continues flow", async () => {
    // 设置服务器状态为 false,本地状态为 true,触发状态变化
    serverSettings = {
      ...serverSettings,
      enableClaudePluginIntegration: false,
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        enableClaudePluginIntegration: true, // 状态改变
        language: "zh",
      },
    });
    directorySettingsMock = createDirectorySettingsMock({
      appConfigDir: "/override/app",
      initialAppConfigDir: "/prior/app",
    });

    applyClaudePluginConfigMock.mockRejectedValueOnce(new Error("sync failed"));

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(toastErrorMock).toHaveBeenCalled();
    const message = toastErrorMock.mock.calls.at(-1)?.[0] as string;
    expect(message).toContain("同步 Claude 插件失败");
    expect(metadataMock.setRequiresRestart).toHaveBeenCalledWith(true);
  });

  it("resets form, language and directories using server data", () => {
    serverSettings = {
      ...serverSettings,
      claudeConfigDir: "  /server/claude  ",
      codexConfigDir: "   ",
      openclawConfigDir: "  /server/openclaw  ",
      language: "zh",
    };
    useSettingsQueryMock.mockReturnValue({
      data: serverSettings,
      isLoading: false,
    });

    settingsFormMock = createSettingsFormMock({
      settings: {
        ...serverSettings,
        language: "zh",
      },
      initialLanguage: "zh",
    });
    directorySettingsMock = createDirectorySettingsMock();

    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.resetSettings();
    });

    expect(settingsFormMock.resetSettings).toHaveBeenCalledWith(serverSettings);
    expect(settingsFormMock.syncLanguage).toHaveBeenCalledWith(
      settingsFormMock.initialLanguage,
    );
    expect(directorySettingsMock.resetAllDirectories).toHaveBeenCalledWith(
      "/server/claude",
      undefined,
      undefined, // geminiConfigDir
      undefined, // opencodeConfigDir
      "/server/openclaw",
    );
    expect(metadataMock.setRequiresRestart).toHaveBeenCalledWith(false);
  });

  it("returns null immediately when settings state is missing", async () => {
    settingsFormMock = createSettingsFormMock({
      settings: null,
    });

    const { result } = renderHook(() => useSettings());

    let resultValue: { requiresRestart: boolean } | null = null;
    await act(async () => {
      resultValue = await result.current.saveSettings();
    });

    expect(resultValue).toBeNull();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(setAppConfigDirOverrideMock).not.toHaveBeenCalled();
  });

  it("throws when save mutation rejects and keeps restart flag untouched", async () => {
    settingsFormMock = createSettingsFormMock();
    directorySettingsMock = createDirectorySettingsMock({
      appConfigDir: "/override/app",
      initialAppConfigDir: "/override/app",
    });
    const rejection = new Error("save failed");
    mutateAsyncMock.mockRejectedValueOnce(rejection);

    const { result } = renderHook(() => useSettings());

    await expect(
      act(async () => {
        await result.current.saveSettings();
      }),
    ).rejects.toThrow("save failed");

    expect(setAppConfigDirOverrideMock).not.toHaveBeenCalled();
    expect(metadataMock.setRequiresRestart).not.toHaveBeenCalledWith(true);
  });
});
