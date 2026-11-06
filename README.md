# dsh-model-allowance

[中文](README.zh.md)

Shows the balance or remaining allowance of the provider behind the current
conversation model.

## Supported

- DeepSeek
- MiniMax Coding Plan
- Zhipu Coding Plan
- Kimi for Coding
- OpenCode Go

### Not supported

- Qwen Token Plan: the vendor publishes no balance API

## Installation

### Install from npm (recommended)

1. Open the **Plugins** page in the DSH sidebar.
2. Choose **Install** and enter:

   ```
   dsh-model-allowance@1.0.0
   ```

   Use the latest published version instead of `1.0.0` when a newer one
   exists.
3. Confirm the installation. If DSH reports **restart required**, restart
   DSH; otherwise refresh the page.

The npm installation is eligible for the Plugin Manager's **Update** action.

### Install from GitHub

```
git+https://github.com/MeiK2333/dsh-model-allowance.git#v1.0.0
```

Git installations are not covered by the Plugin Manager's **Update** action;
updating means removing the old version first, then installing the new tag.

## Compatibility

DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`.

## License

[MIT](LICENSE). Provider icons are trademarks of their respective owners,
used only to identify them.
