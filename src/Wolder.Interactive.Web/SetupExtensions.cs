﻿using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Workspace;

namespace Wolder.Interactive.Web;

public static class GeneratorWorkspaceBuilderExtensions
{
    public static GeneratorWorkspaceBuilder AddInteractiveWebServer(this GeneratorWorkspaceBuilder builder)
    {
        var server = new WorkspaceInteractiveWebHost();
        builder.Services.AddSingleton(server);
        builder.EventDispatcher.Delegates.Add(server.WorkspaceStateManager.Events);
        return builder;
    }
}