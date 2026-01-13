# Contributing to Rémi Card

Thank you for your interest in contributing to the Rémi Card project! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Translation Contributions](#translation-contributions)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project follows a simple code of conduct:

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher
- Basic knowledge of:
  - TypeScript
  - Lit web components
  - Home Assistant custom cards

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/remi-card.git
   cd remi-card
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/homeassistant-fr-ecosystem/remi-card.git
   ```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Project Structure

```
remi-card/
├── src/
│   ├── remi-card.ts              # Main card component
│   ├── remi-card-editor.ts       # Configuration editor
│   ├── face-images.ts            # Face state mappings
│   ├── localize.ts               # Localization engine
│   ├── translations/             # Translation files
│   │   ├── en.json               # English
│   │   ├── fr.json               # French
│   ├── face/                     # Face image assets
│   └── types/                    # TypeScript declarations
├── dist/                          # Build output
├── rollup.config.mjs             # Build configuration
├── tsconfig.json                 # TypeScript configuration
└── eslint.config.js              # Linting rules
```

### Available Scripts

```bash
npm run build      # Build for production
npm run watch      # Build and watch for changes
npm run lint       # Run ESLint
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `i18n/` - Translation updates

### 2. Make Your Changes

- Write clear, concise code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes

#### Manual Testing

1. Build the project:
   ```bash
   npm run build
   ```

2. Copy `dist/remi-card.js` to your Home Assistant:
   ```bash
   cp dist/remi-card.js /path/to/homeassistant/www/community/remi-card/
   ```

3. Clear browser cache and refresh Home Assistant

4. Test all functionality:
   - Light controls (on/off, brightness)
   - Face selector (all 5 faces)
   - Temperature display
   - Connectivity status
   - Editor configuration
   - Multiple languages (if i18n changes)

#### Automated Testing

```bash
npm run lint    # Check code quality
```

### 4. Commit Your Changes

Follow conventional commit format:

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve issue with light control"
git commit -m "docs: update README with new instructions"
git commit -m "i18n: add Italian translations"
```

Commit message prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks
- `i18n:` - Translation updates

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Code Standards

### TypeScript

- **Use TypeScript**: All code should be properly typed
- **Avoid `any`**: Use specific types or `unknown`
- **Define interfaces**: For all data structures
- **Use `const` and `let`**: Never use `var`
- **Arrow functions**: Prefer arrow functions for callbacks

Example:
```typescript
// ✅ Good
interface Config {
  device_id: string;
  show_controls?: boolean;
}

private _handleClick = (event: Event): void => {
  const target = event.target as HTMLElement;
  // ...
};

// ❌ Bad
private _handleClick(event: any) {
  var target = event.target;
  // ...
}
```

### Lit Components

- **Use decorators**: `@customElement`, `@property`, `@state`
- **Proper lifecycle**: Use appropriate lifecycle methods
- **CSS-in-JS**: Keep styles in the component
- **Reactive properties**: Use `@state` for internal state

Example:
```typescript
@customElement('my-element')
export class MyElement extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _value = '';

  protected render() {
    return html`<div>${this._value}</div>`;
  }
}
```

### Code Style

- **Indentation**: 2 spaces
- **Line length**: Max 100 characters (flexible for readability)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Trailing commas**: Use in multi-line objects/arrays

The project uses ESLint to enforce these rules automatically.

### Documentation

- **JSDoc comments**: For all public methods and complex logic
- **Inline comments**: For non-obvious code
- **Type annotations**: Even when TypeScript can infer

Example:
```typescript
/**
 * Handle brightness slider changes
 * Provides immediate UI feedback without calling the service
 * @param e - The input event
 */
private _handleSliderChange(e: Event): void {
  // Update UI immediately for smooth interaction
  this.requestUpdate();
}
```

## Testing

### Before Submitting

Ensure your changes:
- ✅ Build successfully (`npm run build`)
- ✅ Pass linting (`npm run lint`)
- ✅ Work in Home Assistant
- ✅ Don't break existing functionality
- ✅ Work across all supported languages (if UI changes)

### Test Checklist

For UI changes:
- [ ] Test with light on/off
- [ ] Test brightness slider (0-100%)
- [ ] Test all 5 face selections
- [ ] Test temperature click (opens history)
- [ ] Test connectivity status display
- [ ] Test configuration editor
- [ ] Test with different device IDs

For i18n changes:
- [ ] Test with English
- [ ] Test with French
- [ ] Test with Spanish
- [ ] Test with German
- [ ] Verify all strings are translated
- [ ] Check for truncation/overflow

## Pull Request Process

### Before Submitting

1. **Update from upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure clean build**:
   ```bash
   npm run build
   npm run lint
   ```

3. **Write clear PR description**:
   - What changes were made
   - Why these changes were needed
   - How to test the changes
   - Screenshots/videos (for UI changes)

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Translation update

## Testing
How to test these changes:
1. Step one
2. Step two
3. Expected result

## Screenshots
(If applicable)

## Checklist
- [ ] Code builds successfully
- [ ] Linting passes
- [ ] Tested in Home Assistant
- [ ] Documentation updated
- [ ] Follows code standards
```

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, your PR will be merged
4. Your contribution will be included in the next release

## Translation Contributions

Adding or improving translations is a great way to contribute!

### Adding a New Language

1. Create translation file:
   ```bash
   cp src/translations/en.json src/translations/YOUR-LANG.json
   ```

2. Translate all strings in the file

3. Register the language in `src/localize.ts`:
   ```typescript
   import * as YOUR_LANG from './translations/YOUR-LANG.json';

   const LANGUAGES = {
     en,
     fr,
     es,
     de,
     YOUR_LANG, // Add here
   };
   ```

4. Build and test:
   ```bash
   npm run build
   ```

5. Submit a PR with your translation

See [I18N.md](I18N.md) for detailed translation guidelines.

### Improving Existing Translations

1. Edit the appropriate file in `src/translations/`
2. Ensure all keys are present
3. Test in Home Assistant
4. Submit a PR

Translation quality checklist:
- [ ] Accurate translation
- [ ] Natural phrasing
- [ ] Appropriate formality
- [ ] Consistent terminology
- [ ] No truncation in UI
- [ ] Cultural appropriateness

## Reporting Bugs

### Before Reporting

1. Check existing issues
2. Test with latest version
3. Verify it's not a Home Assistant issue
4. Gather debug information

### Bug Report Template

```markdown
## Bug Description
Clear description of the bug.

## Steps to Reproduce
1. Step one
2. Step two
3. See error

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- Home Assistant version:
- Browser:
- Rémi Card version:
- Language:

## Screenshots/Logs
(If applicable)

## Additional Context
Any other relevant information.
```

## Feature Requests

We welcome feature suggestions!

### Feature Request Template

```markdown
## Feature Description
Clear description of the feature.

## Use Case
Why is this feature needed?

## Proposed Solution
How could this work?

## Alternatives Considered
Other ways to achieve this.

## Additional Context
Mockups, examples, etc.
```

## Development Tips

### Hot Reload Development

Use watch mode for faster development:
```bash
npm run watch
```

Files will automatically rebuild on changes.

### Debugging

Enable browser console in Home Assistant to see:
- Component lifecycle logs
- State changes
- Error messages
- Language detection

### Common Issues

**Build fails with TypeScript errors:**
- Run `npm install` to ensure dependencies are up to date
- Check `tsconfig.json` is not modified
- Ensure all types are properly defined

**Linting errors:**
- Run `npm run lint` to see all issues
- Most issues can be auto-fixed
- Follow the code standards above

**Changes not visible in HA:**
- Clear browser cache (Ctrl+Shift+R)
- Check browser console for errors
- Verify `remi-card.js` was updated
- Restart Home Assistant if needed

## Questions?

- **Documentation**: Check [README.md](README.md) and [I18N.md](I18N.md)
- **Issues**: Search or create a GitHub issue
- **Discussions**: Use GitHub Discussions for questions

## Recognition

Contributors will be:
- Listed in release notes
- Credited in the project
- Part of the growing Home Assistant French ecosystem community

Thank you for contributing to Rémi Card! 🎉
