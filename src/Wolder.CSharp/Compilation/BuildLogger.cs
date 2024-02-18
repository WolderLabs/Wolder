using Microsoft.Build.Framework;
using System;
using System.Text;

namespace Wolder.CSharp.Compilation;

public class BuildLogger : ILogger
{
    private readonly StringBuilder _messages = new StringBuilder();
    private readonly StringBuilder _warnings = new StringBuilder();
    private readonly StringBuilder _errors = new StringBuilder();
    private readonly Microsoft.Extensions.Logging.ILogger _logger;

    public BuildLogger(Microsoft.Extensions.Logging.ILogger logger)
    {
        _logger = logger;
    }

    public BuildOutput GetOutput() =>
        new BuildOutput(
            _messages.ToString(),
            _warnings.ToString(),
            _errors.ToString());

    public void Initialize(IEventSource eventSource)
    {
        // Register for build events here
        eventSource.MessageRaised += OnMessageRaised;
        eventSource.WarningRaised += OnWarningRaised;
        eventSource.ErrorRaised += OnErrorRaised;
    }

    private void OnMessageRaised(object sender, BuildMessageEventArgs e)
    {
        // Log message events
        _messages.AppendLine(e.Message);
    }

    private void OnWarningRaised(object sender, BuildWarningEventArgs e)
    {
        // Log warning events
        _warnings.AppendLine(e.Message);
    }

    private void OnErrorRaised(object sender, BuildErrorEventArgs e)
    {
        // Log error events
        _errors.AppendLine(e.Message);
    }

    public void Shutdown()
    {
        // Perform any necessary cleanup or final logging here
    }

    public string Parameters { get; set; }

    public LoggerVerbosity Verbosity { get; set; } = LoggerVerbosity.Minimal;
}

