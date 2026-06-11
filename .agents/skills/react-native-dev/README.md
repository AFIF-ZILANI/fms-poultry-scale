# React Native Development Skill

A comprehensive Claude Code skill for React Native and Expo mobile development.

## Overview

This skill provides expert guidance for building production-ready cross-platform mobile applications with React Native and Expo. It includes comprehensive reference materials covering all aspects of React Native development.

## What's Included

### Core Features

- **Project Setup & Initialization** - Create new Expo apps with proper configuration
- **Version Management** - Expo SDK and React Native version compatibility
- **Navigation** - Expo Router implementation (tabs, stacks, deep linking)
- **Performance Optimization** - FlatList optimization, animations, best practices
- **Platform Handling** - iOS/Android specific code and SafeArea management
- **Storage Solutions** - AsyncStorage and MMKV implementation
- **Project Structure** - Recommended architecture and organization

### Reference Files

- `setup-guide.md` - Creating projects, Expo Go vs Development Builds
- `version-management.md` - SDK compatibility, `expo install` usage
- `best-practices.md` - Performance, memory management, code quality
- `expo-router.md` - File-based navigation, protected routes
- `platform-handling.md` - Platform-specific code, SafeArea, keyboard
- `list-optimization.md` - FlatList performance, infinite scroll
- `storage-hooks.md` - AsyncStorage, MMKV, persistence
- `project-structure.md` - File organization, configuration

## Installation

1. Download the `.skill` file from releases
2. Extract to your Claude skills directory: `~/.claude/skills/`
3. Restart Claude Code

Or install manually:
```bash
cd ~/.claude/skills
unzip react-native-dev.skill
```

## Usage

The skill automatically activates when you work with:
- React Native or Expo projects
- Mobile app development (iOS/Android)
- Navigation implementation
- Performance optimization
- Version compatibility issues
- Installing dependencies with `expo install`

## Key Principles

### Version Management
- **Always use `npx expo install`** instead of `npm install` or `yarn add`
- Expo SDK versions map one-to-one with React Native versions
- Check compatibility before upgrading dependencies

### Performance
- Use FlatList/SectionList for lists (never ScrollView for >50 items)
- Memoize list items with `memo()` and callbacks with `useCallback()`
- Test performance in release mode, not development mode
- Remove console.log statements in production

### Platform Handling
- Use `Platform.select()` for platform-specific styles
- Use SafeAreaView or useSafeAreaInsets for notches
- Handle Android back button with BackHandler
- Use KeyboardAvoidingView with platform-specific behavior

## Documentation Sources

This skill integrates official documentation from:
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- React Native performance best practices
- Expo SDK version compatibility guidelines

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Author

Created for use with [Claude Code](https://claude.com/claude-code)
