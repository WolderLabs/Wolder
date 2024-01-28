using DeGA.Actions.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generators.CSharp.OpenAI;

public class CodeGeneratorFactory(IServiceProvider services)
{
    public CodeGenerator Create(DotNetProject project)
    {
        return ActivatorUtilities.CreateInstance<CodeGenerator>(services, project);
    }
}
