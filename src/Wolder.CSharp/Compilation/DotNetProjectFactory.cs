using Wolder.Core.Files;
using Microsoft.Extensions.DependencyInjection;

namespace Wolder.CSharp.Compilation;

public class DotNetProjectFactory(IServiceProvider services, ISourceFiles sourceFiles) : IDotNetProjectFactory
{
    public IDotNetProject Create(DotNetProjectReference reference)
    {
        var path = reference.RelativeFilePath;
        var fullPath = sourceFiles.GetAbsolutePath(path);
        return ActivatorUtilities.CreateInstance<DotNetProject>(services, fullPath);
    }
}